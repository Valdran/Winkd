// ── Server Config ──

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub listen_addr: String,
    pub database_url: String,
    pub redis_url: String,
    /// Shared secret used to verify Buy Me a Coffee webhook signatures.
    /// Configure this in BMAC's dashboard and mirror it here. Unset means
    /// the webhook endpoint rejects every request — safer than accepting
    /// unauthenticated payloads in production.
    pub bmac_webhook_secret: Option<String>,
    /// BMAC membership level name that maps to the Max tier. Anything else
    /// (lower tiers, one-time supports) won't grant Max access.
    pub bmac_max_tier_name: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            // Respect LISTEN_ADDR first, then Railway's injected PORT, then default.
            listen_addr: env::var("LISTEN_ADDR").unwrap_or_else(|_| {
                env::var("PORT")
                    .map(|p| format!("0.0.0.0:{p}"))
                    .unwrap_or_else(|_| "0.0.0.0:8080".into())
            }),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://winkd:winkd@localhost:5432/winkd".into()),
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            bmac_webhook_secret: env::var("BMAC_WEBHOOK_SECRET").ok().filter(|s| !s.is_empty()),
            bmac_max_tier_name: env::var("BMAC_MAX_TIER_NAME")
                .unwrap_or_else(|_| "Max".into()),
        }
    }
}
