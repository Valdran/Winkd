// ── Server Config ──

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub listen_addr: String,
    pub database_url: String,
    pub redis_url: String,
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
        }
    }
}
