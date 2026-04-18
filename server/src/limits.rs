// ── Tier-aware message/attachment limits ──
//
// These are the authoritative limits the server enforces on every inbound
// SendMessage command. The same numbers are echoed to the client in the
// `auth_ok` frame so the web UI can pre-flight-check uploads and render a
// Discord-style character counter, but the client values are only a UX hint —
// a tampered client still can't exceed the server's cap.
//
// Sizing rationale (see docs/MONETISATION.md):
//   • Client persistence lives in localStorage which is ~5 MB per origin, so
//     the free attachment cap stays under that to keep a handful of recent
//     images in history without blowing the quota.
//   • Max (supporter) adds headroom; the WebSocket frame size is lifted to
//     32 MiB server-side so a 10 MB attachment fits after base64 inflation.
//   • Text caps mirror Discord's 2000 char free / 4000 Nitro convention but
//     shifted to 6000 for Max so long-form letters fit in a single bubble.

use serde::Serialize;

pub const SUPPORTER_FREE: &str = "free";
pub const SUPPORTER_MAX: &str = "max";

#[derive(Debug, Clone, Copy, Serialize)]
pub struct TierLimits {
    pub max_text_chars: usize,
    pub max_media_bytes: usize,
    pub max_media_url_chars: usize,
}

pub const FREE_LIMITS: TierLimits = TierLimits {
    max_text_chars: 2_000,
    max_media_bytes: 3 * 1024 * 1024,
    max_media_url_chars: 1_024,
};

pub const MAX_LIMITS: TierLimits = TierLimits {
    max_text_chars: 6_000,
    max_media_bytes: 10 * 1024 * 1024,
    max_media_url_chars: 2_048,
};

/// Largest frame we allow through the WebSocket — wide enough for a Max-tier
/// attachment after base64 inflation (~1.37×) plus a small headroom for the
/// JSON envelope. tokio-tungstenite defaults are 16 MiB; we raise to 32.
pub const WS_MAX_FRAME_BYTES: usize = 32 * 1024 * 1024;
pub const WS_MAX_MESSAGE_BYTES: usize = 32 * 1024 * 1024;

pub fn limits_for(tier: &str) -> TierLimits {
    match tier {
        SUPPORTER_MAX => MAX_LIMITS,
        _ => FREE_LIMITS,
    }
}

/// Cheap estimate of the number of raw bytes in a base64-encoded `data:` URI.
/// Used to keep attachment caps honest without decoding the payload.
pub fn approx_base64_decoded_len(data_uri: &str) -> usize {
    let comma = data_uri.find(',').map(|i| i + 1).unwrap_or(0);
    let body = &data_uri[comma..];
    // 4 base64 chars → 3 raw bytes. Padding (`=`) is already part of the char
    // count so this overshoots by at most 2 bytes — fine for a size guard.
    body.len().saturating_mul(3) / 4
}

#[derive(Debug)]
pub enum LimitViolation {
    TextTooLong { len: usize, max: usize },
    MediaTooLarge { bytes: usize, max: usize },
    MediaUrlTooLong { len: usize, max: usize },
}

impl LimitViolation {
    pub fn user_message(&self, tier: &str) -> String {
        let max_hint = if tier == SUPPORTER_MAX { "" } else { " (upgrade to Max for a higher limit)" };
        match self {
            Self::TextTooLong { len, max } => {
                format!("Message is {len} characters — limit is {max}{max_hint}.")
            }
            Self::MediaTooLarge { bytes, max } => {
                let mb = |n: usize| n as f64 / 1024.0 / 1024.0;
                format!("Attachment is {:.1} MB — limit is {:.0} MB{max_hint}.", mb(*bytes), mb(*max))
            }
            Self::MediaUrlTooLong { len, max } => {
                format!("Attachment link is {len} characters — limit is {max}{max_hint}.")
            }
        }
    }
}

/// Validate a `send_message` payload (text, winkd, nudge, wink) against the
/// provided tier limits. Returns the first violation encountered.
pub fn validate_send_payload(
    payload: &serde_json::Value,
    limits: &TierLimits,
) -> Result<(), LimitViolation> {
    if let Some(body) = payload.get("body").and_then(|v| v.as_str()) {
        let len = body.chars().count();
        if len > limits.max_text_chars {
            return Err(LimitViolation::TextTooLong { len, max: limits.max_text_chars });
        }
    }

    let media_data = payload
        .get("mediaData")
        .or_else(|| payload.get("media_data"))
        .and_then(|v| v.as_str());
    if let Some(data_uri) = media_data {
        let bytes = approx_base64_decoded_len(data_uri);
        if bytes > limits.max_media_bytes {
            return Err(LimitViolation::MediaTooLarge { bytes, max: limits.max_media_bytes });
        }
    }

    let media_url = payload
        .get("mediaUrl")
        .or_else(|| payload.get("media_url"))
        .and_then(|v| v.as_str());
    if let Some(url) = media_url {
        if url.len() > limits.max_media_url_chars {
            return Err(LimitViolation::MediaUrlTooLong {
                len: url.len(),
                max: limits.max_media_url_chars,
            });
        }
    }

    Ok(())
}
