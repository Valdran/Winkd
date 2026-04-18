// ── Buy Me a Coffee (BMAC) webhook handler ──
//
// BMAC lets creators accept one-off "coffees" and recurring memberships. Both
// surface as webhook events when they're configured in the BMAC dashboard
// (Integrations → Webhooks). We use them to:
//
//   • Grant Max-tier supporter status for the duration of an active
//     membership (higher text + attachment caps).
//   • Record one-off "extras" (e.g. emoji-pack purchases) against the
//     matching user account.
//
// The mapping from BMAC → Winkd account is the supporter's email:
//   1. BMAC sends the purchase with `supporter_email`.
//   2. We look up the user whose `users.email` matches (case-insensitive).
//   3. If there is no match we still record the event so it can be claimed
//      later when the user signs up / adds their email.
//
// Security: BMAC signs every webhook body with HMAC-SHA256 using the secret
// set in the dashboard. We reject any request whose signature doesn't match
// `BMAC_WEBHOOK_SECRET`. If the secret env var is unset the endpoint returns
// 503 so production deployments can't accidentally accept unauthenticated
// unlocks.

use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;

use crate::{db, router::AppState};

type HmacSha256 = Hmac<Sha256>;

/// POST /api/bmac/webhook — idempotent entry point for every BMAC event.
pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let Some(secret) = state.config.bmac_webhook_secret.as_deref() else {
        tracing::warn!("BMAC webhook hit but BMAC_WEBHOOK_SECRET is unset — refusing");
        return (StatusCode::SERVICE_UNAVAILABLE, "bmac webhook disabled").into_response();
    };

    // BMAC sets `X-Signature-Sha256` to the hex HMAC of the raw body.
    let provided = headers
        .get("x-signature-sha256")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !verify_signature(secret.as_bytes(), &body, provided) {
        tracing::warn!("BMAC webhook rejected: bad signature");
        return (StatusCode::UNAUTHORIZED, "bad signature").into_response();
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return (StatusCode::BAD_REQUEST, "malformed json").into_response();
    };

    let event_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let data = payload.get("data").unwrap_or(&payload);

    let external_id = data
        .get("transaction_id")
        .or_else(|| data.get("subscription_id"))
        .or_else(|| data.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if external_id.is_empty() {
        return (StatusCode::BAD_REQUEST, "missing transaction id").into_response();
    }

    let email = data
        .get("supporter_email")
        .or_else(|| data.get("payer_email"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let matched_user = match email.as_deref() {
        Some(e) => db::find_user_by_email(&state.db, e).await.ok().flatten(),
        None => None,
    };
    let user_id = matched_user.as_ref().map(|u| u.id);

    let amount_cents = data
        .get("amount")
        .and_then(|v| v.as_f64())
        .map(|f| (f * 100.0).round() as i32);
    let currency = data
        .get("currency")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    // Record the event first. If this is a replay of one we've already
    // processed, skip the side effects entirely — that's the idempotency
    // guarantee BMAC retries rely on.
    let first_time = db::record_bmac_event(
        &state.db,
        &external_id,
        &event_type,
        email.as_deref(),
        user_id,
        amount_cents,
        currency.as_deref(),
        &payload,
    )
    .await
    .unwrap_or(false);

    if !first_time {
        return Json(json!({ "ok": true, "replayed": true })).into_response();
    }

    if let Some(user) = matched_user {
        apply_event_side_effects(&state, &user, &event_type, data).await;
    } else {
        tracing::info!(
            "BMAC event {event_type} for unknown email — stored for later claim"
        );
    }

    Json(json!({ "ok": true })).into_response()
}

async fn apply_event_side_effects(
    state: &AppState,
    user: &db::User,
    event_type: &str,
    data: &Value,
) {
    match event_type {
        // Recurring membership started or renewed.
        "membership.started" | "membership.renewed" | "subscription.created"
        | "subscription.renewed" => {
            let tier_name = data
                .get("membership_level_name")
                .or_else(|| data.get("tier_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if tier_name.eq_ignore_ascii_case(&state.config.bmac_max_tier_name) {
                // Default to 35 days (~monthly billing cycle + grace). If BMAC
                // sends an explicit period_end timestamp, prefer that.
                let expires = data
                    .get("current_period_end")
                    .and_then(|v| v.as_str())
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|| Utc::now() + Duration::days(35));

                if let Err(e) = db::set_supporter_max(&state.db, user.id, expires).await {
                    tracing::warn!("set_supporter_max failed: {e}");
                }
            }
        }

        // Membership cancelled or lapsed → drop to free at period end. For
        // simplicity we downgrade immediately; the UX cost of losing tier a
        // few days early is smaller than letting a cancelled member keep
        // Max access forever.
        "membership.cancelled" | "subscription.cancelled" | "subscription.ended" => {
            if let Err(e) = db::set_supporter_free(&state.db, user.id).await {
                tracing::warn!("set_supporter_free failed: {e}");
            }
        }

        // One-off purchase of an "Extra" — typically an emoji pack. The
        // extra's id/slug is recorded against the user.
        "extra.purchased" | "purchase.created" => {
            let extra_id = data
                .get("extra_id")
                .or_else(|| data.get("extra_slug"))
                .or_else(|| data.get("sku"))
                .and_then(|v| v.as_str());
            if let Some(id) = extra_id {
                if let Err(e) = db::add_purchased_extra(&state.db, user.id, id).await {
                    tracing::warn!("add_purchased_extra failed: {e}");
                }
            }
        }

        other => {
            tracing::debug!("BMAC event {other} ignored (no handler)");
        }
    }
}

fn verify_signature(secret: &[u8], body: &[u8], provided_hex: &str) -> bool {
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(body);
    let expected = mac.finalize().into_bytes();
    let Ok(provided) = hex::decode(provided_hex.trim_start_matches("sha256=")) else {
        return false;
    };
    // Constant-time compare via the crate's helper.
    expected.as_slice().ct_eq(&provided)
}

// ── ct_eq helper ───────────────────────────────────────────────────────────
// Avoids an extra dependency (subtle / constant_time_eq) for a single use.
trait ConstantTimeEq {
    fn ct_eq(&self, other: &[u8]) -> bool;
}
impl ConstantTimeEq for [u8] {
    fn ct_eq(&self, other: &[u8]) -> bool {
        if self.len() != other.len() {
            return false;
        }
        let mut diff: u8 = 0;
        for (a, b) in self.iter().zip(other.iter()) {
            diff |= a ^ b;
        }
        diff == 0
    }
}
