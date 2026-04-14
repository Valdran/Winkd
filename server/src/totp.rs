// ── TOTP (RFC 6238) ──
// Implements Time-based One-Time Password generation and verification.
// Uses HMAC-SHA1 as mandated by the RFC; the shared secret is stored as
// a Base32-encoded string compatible with every authenticator app.

use std::time::{SystemTime, UNIX_EPOCH};

use data_encoding::BASE32_NOPAD;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

const STEP_SECS: u64 = 30;
const DIGITS: u32 = 6;

// ── Secret generation ──────────────────────────────────────────────────────

/// Generate a fresh 20-byte (160-bit) TOTP secret encoded as Base32.
/// The returned string is suitable for storage and for use in an otpauth:// URI.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 20];
    rand::thread_rng().fill_bytes(&mut bytes);
    BASE32_NOPAD.encode(&bytes)
}

// ── URI generation ─────────────────────────────────────────────────────────

/// Build an `otpauth://totp/` URI that authenticator apps (Google Authenticator,
/// Authy, Bitwarden, etc.) can ingest directly or via a QR code scan.
pub fn totp_uri(secret: &str, account: &str, issuer: &str) -> String {
    format!(
        "otpauth://totp/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period=30",
        urlencoding::encode(issuer),
        urlencoding::encode(account),
        secret,
        urlencoding::encode(issuer),
    )
}

// ── Verification ───────────────────────────────────────────────────────────

/// Verify a 6-digit TOTP code against a Base32-encoded secret.
/// Accepts codes from the current, previous, and next 30-second windows
/// to tolerate minor clock skew between client and server.
pub fn verify(secret_b32: &str, code: &str) -> bool {
    let code = code.trim();
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let expected: u32 = match code.parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    let secret = match BASE32_NOPAD.decode(secret_b32.as_bytes()) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let now = current_unix_secs();

    // Check current window and ±1 adjacent windows (handles up to 30 s of clock skew).
    for delta in [-1i64, 0, 1] {
        let counter = ((now as i64).saturating_add(delta * STEP_SECS as i64)) as u64 / STEP_SECS;
        if hotp(&secret, counter) == expected {
            return true;
        }
    }
    false
}

// ── HOTP core (RFC 4226) ───────────────────────────────────────────────────

fn hotp(secret: &[u8], counter: u64) -> u32 {
    let mut mac = HmacSha1::new_from_slice(secret)
        .expect("HMAC-SHA1 accepts any key length");
    mac.update(&counter.to_be_bytes());
    let result = mac.finalize().into_bytes();

    // Dynamic truncation (RFC 4226 §5.3)
    let offset = (result[19] & 0x0f) as usize;
    let code = u32::from_be_bytes([
        result[offset] & 0x7f,
        result[offset + 1],
        result[offset + 2],
        result[offset + 3],
    ]);
    code % 10u32.pow(DIGITS)
}

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 6238 appendix B test vector (SHA-1, T0=0, step=30, digits=8).
    /// Our implementation uses 6 digits; we just check the truncation math.
    #[test]
    fn hotp_known_vector() {
        // Secret: ASCII "12345678901234567890" (from RFC 4226 appendix D)
        let secret = b"12345678901234567890";
        // HOTP counter=0 → 755224 (first 6 digits from the RFC table)
        assert_eq!(hotp(secret, 0), 755224);
        // HOTP counter=1 → 287082
        assert_eq!(hotp(secret, 1), 287082);
    }

    #[test]
    fn generated_secret_is_valid_base32() {
        let s = generate_secret();
        assert!(BASE32_NOPAD.decode(s.as_bytes()).is_ok());
        assert_eq!(s.len(), 32); // ceil(20 * 8 / 5) = 32 base32 chars
    }

    #[test]
    fn verify_rejects_wrong_code() {
        let secret = generate_secret();
        assert!(!verify(&secret, "000000"));
        assert!(!verify(&secret, "abc123"));
        assert!(!verify(&secret, "12345")); // too short
    }
}
