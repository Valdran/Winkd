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
    pub email: Option<String>,
    pub password_hash: Option<String>,
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

/// Create a session and return its opaque token.
pub async fn create_session(pool: &DbPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    let token = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO sessions (user_id, token) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&token)
        .execute(pool)
        .await?;
    Ok(token)
}

/// Validate a session token and return the associated user (None if expired/missing).
pub async fn find_user_by_session(
    pool: &DbPool,
    token: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"SELECT u.* FROM users u
           JOIN sessions s ON s.user_id = u.id
           WHERE s.token = $1 AND s.expires_at > NOW()"#,
    )
    .bind(token)
    .fetch_optional(pool)
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
    Ok(format!("{}#{}", base, &Uuid::new_v4().simple().to_string()[..4]))
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
    Ok(format!("{}{}", base, &Uuid::new_v4().simple().to_string()[..4]))
}
