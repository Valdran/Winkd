// ── Database helpers ──
// Thin wrappers around SQLx so auth.rs stays readable.
// Uses the non-macro query API so DATABASE_URL is not required at compile time.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub type DbPool = PgPool;

// ── Row types ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow, Clone, Debug)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub winkd_id: String,
    pub display_name: String,
    pub mood_message: String,
    pub avatar_data: Option<String>,
    pub display_name_color: Option<String>,
    pub av_color: Option<String>,
    pub email: Option<String>,
    pub password_hash: Option<String>,
    pub totp_enabled: bool,
    pub totp_secret: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Connection + migration ─────────────────────────────────────────────────

pub async fn connect(url: &str) -> Result<DbPool, sqlx::Error> {
    PgPool::connect(url).await
}

/// Create a pool without establishing a connection immediately.
/// Connections are opened on first use, so the server can bind and serve
/// /health before the database is ready.
pub fn connect_lazy(url: &str) -> Result<DbPool, sqlx::Error> {
    PgPool::connect_lazy(url)
}

pub async fn run_migrations(pool: &DbPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

// ── User CRUD ──────────────────────────────────────────────────────────────

pub async fn create_user(
    pool: &DbPool,
    username: &str,
    winkd_id: &str,
    display_name: &str,
    email: Option<&str>,
    password_hash: Option<&str>,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"INSERT INTO users (username, winkd_id, display_name, email, password_hash)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
    )
    .bind(username)
    .bind(winkd_id)
    .bind(display_name)
    .bind(email)
    .bind(password_hash)
    .fetch_one(pool)
    .await
}

pub async fn update_user_profile(
    pool: &DbPool,
    user_id: Uuid,
    display_name: &str,
    mood_message: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"UPDATE users
           SET display_name = $2,
               mood_message  = $3,
               updated_at    = NOW()
           WHERE id = $1
           RETURNING *"#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(mood_message)
    .fetch_one(pool)
    .await
}

pub async fn update_user_display_name(
    pool: &DbPool,
    user_id: Uuid,
    display_name: &str,
    display_name_color: Option<&str>,
    av_color: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE users
           SET display_name       = $2,
               display_name_color = COALESCE($3, display_name_color),
               av_color           = COALESCE($4, av_color),
               updated_at         = NOW()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(display_name_color)
    .bind(av_color)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_user_mood(
    pool: &DbPool,
    user_id: Uuid,
    mood_message: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE users
           SET mood_message = $2,
               updated_at   = NOW()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .bind(mood_message)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_user_avatar(
    pool: &DbPool,
    user_id: Uuid,
    avatar_data: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE users
           SET avatar_data = $2,
               updated_at  = NOW()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .bind(avatar_data)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_user_profile_style(
    pool: &DbPool,
    user_id: Uuid,
    display_name_color: Option<&str>,
    av_color: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE users
           SET display_name_color = $2,
               av_color           = $3,
               updated_at         = NOW()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .bind(display_name_color)
    .bind(av_color)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn find_user_by_username(
    pool: &DbPool,
    username: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(username)
        .fetch_optional(pool)
        .await
}

pub async fn find_user_by_email(pool: &DbPool, email: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
}

/// Find a Winkd user that has a linked OAuth account for (provider, provider_user_id).
pub async fn find_user_by_oauth(
    pool: &DbPool,
    provider: &str,
    provider_user_id: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"SELECT u.* FROM users u
           JOIN oauth_accounts oa ON oa.user_id = u.id
           WHERE oa.provider = $1 AND oa.provider_user_id = $2"#,
    )
    .bind(provider)
    .bind(provider_user_id)
    .fetch_optional(pool)
    .await
}

/// Link an OAuth provider account to an existing Winkd user (idempotent).
pub async fn link_oauth_account(
    pool: &DbPool,
    user_id: Uuid,
    provider: &str,
    provider_user_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider, provider_user_id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(provider)
    .bind(provider_user_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ── Sessions ───────────────────────────────────────────────────────────────

/// Generate a cryptographically random 256-bit (32-byte) session token as lowercase hex.
/// This is significantly stronger than UUID v4 (122-bit) and avoids any UUID library RNG concerns.
fn new_session_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Create a session and return its opaque token.
pub async fn create_session(pool: &DbPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = new_session_token();
    sqlx::query("INSERT INTO sessions (user_id, token) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&token)
        .execute(pool)
        .await?;
    Ok(token)
}

/// Invalidate a specific session token (logout / forced expiry).
pub async fn delete_session(pool: &DbPool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sessions WHERE token = $1")
        .bind(token)
        .execute(pool)
        .await?;
    Ok(())
}

/// Rotate a session: atomically delete the old token and create a fresh one.
/// Returns the new token on success.
pub async fn rotate_session(
    pool: &DbPool,
    old_token: &str,
    user_id: Uuid,
) -> Result<String, sqlx::Error> {
    let new_token = new_session_token();
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM sessions WHERE token = $1")
        .bind(old_token)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO sessions (user_id, token) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&new_token)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(new_token)
}

/// Validate a session token and return the associated user (None if expired/missing).
pub async fn find_user_by_session(pool: &DbPool, token: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"SELECT u.* FROM users u
           JOIN sessions s ON s.user_id = u.id
           WHERE s.token = $1 AND s.expires_at > NOW()"#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
}

// ── Contact requests ───────────────────────────────────────────────────────

#[derive(sqlx::FromRow, Clone, Debug)]
pub struct ContactRequest {
    pub id: Uuid,
    pub from_id: Uuid,
    pub to_id: Uuid,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

/// Flattened result of the pending-inbound join query.
#[derive(sqlx::FromRow, Clone, Debug)]
pub struct PendingContactRequest {
    pub request_id: Uuid,
    pub from_user_id: Uuid,
    pub from_winkd_id: String,
    pub from_display_name: String,
    pub from_avatar_data: Option<String>,
}

#[derive(sqlx::FromRow, Clone, Debug)]
pub struct BlockedUser {
    pub user_id: Uuid,
    pub winkd_id: String,
    pub display_name: String,
    pub avatar_data: Option<String>,
    pub blocked_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow, Clone, Debug)]
pub struct ContactRosterEntry {
    pub winkd_id: String,
    pub display_name: String,
    pub avatar_data: Option<String>,
    pub mood_message: String,
    pub request_status: String,
}

pub async fn find_user_by_id(pool: &DbPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn find_user_by_winkd_id(
    pool: &DbPool,
    winkd_id: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE winkd_id = $1")
        .bind(winkd_id)
        .fetch_optional(pool)
        .await
}

/// Insert a new contact request. If one already exists (same from/to), reset
/// it to 'pending' so a re-send works after a previous decline.
pub async fn create_contact_request(
    pool: &DbPool,
    from_id: Uuid,
    to_id: Uuid,
) -> Result<ContactRequest, sqlx::Error> {
    sqlx::query_as::<_, ContactRequest>(
        r#"INSERT INTO contact_requests (from_id, to_id)
           VALUES ($1, $2)
           ON CONFLICT (from_id, to_id) DO UPDATE SET status = 'pending'
           RETURNING *"#,
    )
    .bind(from_id)
    .bind(to_id)
    .fetch_one(pool)
    .await
}

/// Return all pending inbound contact requests for a user, joined to sender info.
pub async fn list_pending_inbound(
    pool: &DbPool,
    to_id: Uuid,
) -> Result<Vec<PendingContactRequest>, sqlx::Error> {
    sqlx::query_as::<_, PendingContactRequest>(
        r#"SELECT cr.id       AS request_id,
                  u.id        AS from_user_id,
                  u.winkd_id  AS from_winkd_id,
                  u.display_name AS from_display_name,
                  u.avatar_data AS from_avatar_data
           FROM contact_requests cr
           JOIN users u ON u.id = cr.from_id
           WHERE cr.to_id = $1 AND cr.status = 'pending'
           ORDER BY cr.created_at ASC"#,
    )
    .bind(to_id)
    .fetch_all(pool)
    .await
}

/// List a user's accepted contacts and outbound pending requests.
pub async fn list_contact_roster(
    pool: &DbPool,
    user_id: Uuid,
) -> Result<Vec<ContactRosterEntry>, sqlx::Error> {
    sqlx::query_as::<_, ContactRosterEntry>(
        r#"SELECT u.winkd_id,
                  u.display_name,
                  u.avatar_data,
                  u.mood_message,
                  CASE
                    WHEN cr.status = 'accepted' THEN 'accepted'
                    ELSE 'pending_outbound'
                  END AS request_status
           FROM contact_requests cr
           JOIN users u
             ON u.id = CASE
               WHEN cr.from_id = $1 THEN cr.to_id
               ELSE cr.from_id
             END
           WHERE (cr.from_id = $1 OR cr.to_id = $1)
             AND (cr.status = 'accepted' OR (cr.status = 'pending' AND cr.from_id = $1))
           ORDER BY cr.created_at DESC"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

/// Mark a contact request as accepted. Only succeeds if the request is
/// addressed to `to_id` and is still pending.
pub async fn accept_contact_request(
    pool: &DbPool,
    request_id: Uuid,
    to_id: Uuid,
) -> Result<ContactRequest, sqlx::Error> {
    sqlx::query_as::<_, ContactRequest>(
        r#"UPDATE contact_requests
           SET status = 'accepted'
           WHERE id = $1 AND to_id = $2 AND status = 'pending'
           RETURNING *"#,
    )
    .bind(request_id)
    .bind(to_id)
    .fetch_one(pool)
    .await
}

pub async fn reject_contact_request(
    pool: &DbPool,
    request_id: Uuid,
    to_id: Uuid,
) -> Result<ContactRequest, sqlx::Error> {
    sqlx::query_as::<_, ContactRequest>(
        r#"UPDATE contact_requests
           SET status = 'rejected'
           WHERE id = $1 AND to_id = $2 AND status = 'pending'
           RETURNING *"#,
    )
    .bind(request_id)
    .bind(to_id)
    .fetch_one(pool)
    .await
}

pub async fn is_blocked_between(
    pool: &DbPool,
    user_a: Uuid,
    user_b: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"SELECT EXISTS(
            SELECT 1
            FROM blocks
            WHERE (blocker_id = $1 AND blocked_id = $2)
               OR (blocker_id = $2 AND blocked_id = $1)
        )"#,
    )
    .bind(user_a)
    .bind(user_b)
    .fetch_one(pool)
    .await
}

pub async fn create_block(
    pool: &DbPool,
    blocker_id: Uuid,
    blocked_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO blocks (blocker_id, blocked_id)
           VALUES ($1, $2)
           ON CONFLICT (blocker_id, blocked_id) DO NOTHING"#,
    )
    .bind(blocker_id)
    .bind(blocked_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_block(
    pool: &DbPool,
    blocker_id: Uuid,
    blocked_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2")
        .bind(blocker_id)
        .bind(blocked_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_pending_contact_requests_between(
    pool: &DbPool,
    user_a: Uuid,
    user_b: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE contact_requests
           SET status = 'rejected'
           WHERE status = 'pending'
             AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))"#,
    )
    .bind(user_a)
    .bind(user_b)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_blocked_users(
    pool: &DbPool,
    blocker_id: Uuid,
) -> Result<Vec<BlockedUser>, sqlx::Error> {
    sqlx::query_as::<_, BlockedUser>(
        r#"SELECT u.id AS user_id,
                  u.winkd_id,
                  u.display_name,
                  u.avatar_data,
                  b.created_at AS blocked_at
           FROM blocks b
           JOIN users u ON u.id = b.blocked_id
           WHERE b.blocker_id = $1
           ORDER BY b.created_at DESC"#,
    )
    .bind(blocker_id)
    .fetch_all(pool)
    .await
}

// ── ID generation ──────────────────────────────────────────────────────────

/// Generate a Winkd ID (`username#XXXX`) that is not already in the DB.
/// Tries up to 20 random suffixes before falling back to a UUID-based one.
pub async fn unique_winkd_id(pool: &DbPool, base: &str) -> Result<String, sqlx::Error> {
    for _ in 0..20 {
        let candidate = format!("{}#{:04}", base, rand::random::<u16>() % 10000);
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE winkd_id = $1)")
                .bind(&candidate)
                .fetch_one(pool)
                .await?;
        if !exists {
            return Ok(candidate);
        }
    }
    // Extremely unlikely to reach here; use a uuid fragment as a last resort.
    Ok(format!(
        "{}#{}",
        base,
        &Uuid::new_v4().simple().to_string()[..4]
    ))
}

/// Find an unused username derived from `base` by appending numbers as needed.
pub async fn unique_username(pool: &DbPool, base: &str) -> Result<String, sqlx::Error> {
    if find_user_by_username(pool, base).await?.is_none() {
        return Ok(base.to_string());
    }
    for i in 2..=99 {
        let candidate = format!("{}{}", base, i);
        if find_user_by_username(pool, &candidate).await?.is_none() {
            return Ok(candidate);
        }
    }
    Ok(format!(
        "{}{}",
        base,
        &Uuid::new_v4().simple().to_string()[..4]
    ))
}

// ── TOTP ───────────────────────────────────────────────────────────────────

/// Persist a pending TOTP secret for a user (totp_enabled stays false until
/// the user confirms with a valid code via the /confirm endpoint).
pub async fn set_totp_secret(
    pool: &DbPool,
    user_id: Uuid,
    secret: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET totp_secret = $2, updated_at = NOW() WHERE id = $1")
        .bind(user_id)
        .bind(secret)
        .execute(pool)
        .await?;
    Ok(())
}

/// Enable (or disable) TOTP. When disabling, also clears the stored secret.
pub async fn set_totp_enabled(
    pool: &DbPool,
    user_id: Uuid,
    enabled: bool,
) -> Result<(), sqlx::Error> {
    if enabled {
        sqlx::query("UPDATE users SET totp_enabled = TRUE, updated_at = NOW() WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;
    } else {
        sqlx::query(
            "UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, updated_at = NOW() WHERE id = $1",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Issue a short-lived (5-minute) challenge token for a user who has 2FA enabled.
/// The token is a 256-bit random hex string — same generation as session tokens.
pub async fn create_totp_challenge(pool: &DbPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = new_session_token(); // re-use the same CSPRNG helper
    sqlx::query("INSERT INTO totp_challenges (user_id, token) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&token)
        .execute(pool)
        .await?;
    Ok(token)
}

/// Validate and consume a TOTP challenge token.
/// Returns the user_id on success, None if the token is unknown or expired.
/// The token is deleted on first use regardless of outcome.
pub async fn consume_totp_challenge(
    pool: &DbPool,
    token: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        r#"DELETE FROM totp_challenges
           WHERE token = $1 AND expires_at > NOW()
           RETURNING user_id"#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(uid,)| uid))
}

/// Remove all expired TOTP challenge tokens. Safe to call any time.
pub async fn purge_expired_totp_challenges(pool: &DbPool) -> Result<u64, sqlx::Error> {
    let res = sqlx::query("DELETE FROM totp_challenges WHERE expires_at <= NOW()")
        .execute(pool)
        .await?;
    Ok(res.rows_affected())
}

// ── Recovery (Backup) Codes ────────────────────────────────────────────────

/// Replace the user's entire set of recovery codes atomically.
/// `hashes` is a slice of SHA-256 hex digests of the plaintext codes.
pub async fn store_recovery_codes(
    pool: &DbPool,
    user_id: Uuid,
    hashes: &[String],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Wipe the old set first.
    sqlx::query("DELETE FROM recovery_codes WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    for hash in hashes {
        sqlx::query("INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)")
            .bind(user_id)
            .bind(hash)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// How many recovery codes remain for this user.
pub async fn count_recovery_codes(pool: &DbPool, user_id: Uuid) -> Result<i64, sqlx::Error> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM recovery_codes WHERE user_id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    Ok(count.0)
}

/// Attempt to redeem a recovery code. Deletes the matching code on success
/// (single-use). Returns true if a matching code was found and consumed.
pub async fn consume_recovery_code(
    pool: &DbPool,
    user_id: Uuid,
    code_hash: &str,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query(
        r#"DELETE FROM recovery_codes
           WHERE user_id = $1
             AND code_hash = $2
             AND id = (
                 SELECT id FROM recovery_codes
                 WHERE user_id = $1 AND code_hash = $2
                 LIMIT 1
             )"#,
    )
    .bind(user_id)
    .bind(code_hash)
    .execute(pool)
    .await?;
    Ok(res.rows_affected() > 0)
}

// ── Devices ────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow, Clone, Debug, serde::Serialize)]
pub struct Device {
    pub id: Uuid,
    pub user_id: Uuid,
    pub device_id: i32,
    pub device_name: String,
    pub registered_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

/// Return all registered devices for a user, most recently seen first.
pub async fn list_devices(pool: &DbPool, user_id: Uuid) -> Result<Vec<Device>, sqlx::Error> {
    sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE user_id = $1 ORDER BY last_seen DESC")
        .bind(user_id)
        .fetch_all(pool)
        .await
}

/// Register or update a device entry (upsert on user_id + device_id).
pub async fn register_device(
    pool: &DbPool,
    user_id: Uuid,
    device_id: i32,
    device_name: &str,
) -> Result<Device, sqlx::Error> {
    sqlx::query_as::<_, Device>(
        r#"INSERT INTO devices (user_id, device_id, device_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, device_id)
           DO UPDATE SET device_name = EXCLUDED.device_name,
                         last_seen   = NOW()
           RETURNING *"#,
    )
    .bind(user_id)
    .bind(device_id)
    .bind(device_name)
    .fetch_one(pool)
    .await
}

/// Update the last_seen timestamp for a device (called on each WebSocket connect).
pub async fn touch_device(pool: &DbPool, user_id: Uuid, device_id: i32) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE devices SET last_seen = NOW() WHERE user_id = $1 AND device_id = $2")
        .bind(user_id)
        .bind(device_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Revoke a device: deletes its device row and pre_key_bundle.
/// Returns true if a device was actually found and deleted.
pub async fn revoke_device(
    pool: &DbPool,
    user_id: Uuid,
    device_id: i32,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM pre_key_bundles WHERE user_id = $1 AND device_id = $2")
        .bind(user_id)
        .bind(device_id)
        .execute(&mut *tx)
        .await?;

    let res = sqlx::query("DELETE FROM devices WHERE user_id = $1 AND device_id = $2")
        .bind(user_id)
        .bind(device_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(res.rows_affected() > 0)
}

// ── Audit Log ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow, Clone, Debug, serde::Serialize)]
pub struct AuditEntry {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub ip_address: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// Fetch the N most recent audit log entries for a specific user.
pub async fn get_audit_log(
    pool: &DbPool,
    user_id: Uuid,
    limit: i64,
) -> Result<Vec<AuditEntry>, sqlx::Error> {
    sqlx::query_as::<_, AuditEntry>(
        r#"SELECT id, user_id, action,
                  host(ip_address) AS ip_address,
                  metadata, created_at
           FROM   audit_log
           WHERE  user_id = $1
           ORDER  BY created_at DESC
           LIMIT  $2"#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await
}
