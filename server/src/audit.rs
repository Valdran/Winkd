// ── Audit Log ──
// Append-only record of security-relevant events.
// Every call is fire-and-forget: a write failure is logged as a warning
// but never propagates to the caller, so it cannot break the auth flow.

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

// ── Event vocabulary ───────────────────────────────────────────────────────

#[allow(dead_code)]
pub enum Action {
    /// Successful password login.
    Login,
    /// Failed login attempt (wrong password, unknown user, etc.).
    LoginFailed,
    /// New account created.
    Register,
    /// Session invalidated by the user.
    Logout,
    /// All sessions for a user were revoked (e.g. after password change).
    AllSessionsRevoked,
    /// TOTP 2FA was enabled on the account.
    TotpEnabled,
    /// TOTP 2FA was disabled on the account.
    TotpDisabled,
    /// TOTP challenge presented to user (2FA required step).
    TotpChallengeIssued,
    /// Correct TOTP code supplied — challenge passed, full session created.
    TotpChallengePassed,
    /// Wrong TOTP code supplied.
    TotpChallengeFailed,
    /// A backup / recovery code was successfully redeemed.
    RecoveryCodeUsed,
    /// Backup codes were regenerated (old set invalidated).
    RecoveryCodesRegenerated,
    /// A new device was registered (pre_key_bundle uploaded).
    DeviceRegistered,
    /// A device was revoked by the user.
    DeviceRevoked,
    /// Password changed.
    PasswordChanged,
}

impl Action {
    fn as_str(&self) -> &'static str {
        match self {
            Action::Login                    => "login",
            Action::LoginFailed              => "login_failed",
            Action::Register                 => "register",
            Action::Logout                   => "logout",
            Action::AllSessionsRevoked       => "all_sessions_revoked",
            Action::TotpEnabled              => "totp_enabled",
            Action::TotpDisabled             => "totp_disabled",
            Action::TotpChallengeIssued      => "totp_challenge_issued",
            Action::TotpChallengePassed      => "totp_challenge_passed",
            Action::TotpChallengeFailed      => "totp_challenge_failed",
            Action::RecoveryCodeUsed         => "recovery_code_used",
            Action::RecoveryCodesRegenerated => "recovery_codes_regenerated",
            Action::DeviceRegistered         => "device_registered",
            Action::DeviceRevoked            => "device_revoked",
            Action::PasswordChanged          => "password_changed",
        }
    }
}

// ── Write helper ───────────────────────────────────────────────────────────

/// Append a security event to the audit log.
///
/// - `user_id` — `None` for pre-authentication events (login_failed for
///   an unknown username, rate-limit hits, etc.)
/// - `ip`      — client IP as a string; stored as INET in PostgreSQL.
///   Pass `None` when the IP is not available (e.g. WebSocket events).
/// - `metadata` — arbitrary JSON context for the event (device name,
///   OAuth provider, reason for failure, etc.)
pub async fn log(
    pool: &PgPool,
    user_id: Option<Uuid>,
    action: Action,
    ip: Option<&str>,
    metadata: Value,
) {
    let res = sqlx::query(
        r#"INSERT INTO audit_log (user_id, action, ip_address, metadata)
           VALUES ($1, $2, $3::INET, $4)"#,
    )
    .bind(user_id)
    .bind(action.as_str())
    .bind(ip)
    .bind(metadata)
    .execute(pool)
    .await;

    if let Err(e) = res {
        tracing::warn!("audit log write failed (action={}): {e}", action.as_str());
    }
}
