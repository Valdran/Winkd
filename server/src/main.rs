// ── Winkd Server ──
// Phase 1: Axum server with PostgreSQL auth, WebSocket relay, and OAuth.

mod audit;
mod auth;
mod config;
mod db;
mod error;
mod presence;
mod protocol;
mod ratelimit;
mod router;
mod totp;

use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Load .env if present
    let _ = dotenvy::dotenv();

    // Structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "winkd_server=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = config::Config::from_env();

    // Build the pool lazily — no connection is opened yet, so the server can
    // bind and answer /health immediately even if the database isn't ready.
    let pool = db::connect_lazy(&cfg.database_url)
        .expect("Invalid DATABASE_URL — check the connection string format");

    let addr: SocketAddr = cfg.listen_addr.parse().expect("Invalid LISTEN_ADDR");
    let app = router::build_router(cfg, pool.clone()).await;

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");

    info!("Winkd server listening on {addr}");

    // Run migrations in the background with exponential-backoff retries.
    // The HTTP server (including /health) is already accepting requests by
    // the time this task tries to reach the database.
    tokio::spawn(async move {
        for attempt in 1u32..=10 {
            match db::run_migrations(&pool).await {
                Ok(()) => {
                    info!("Database connected and migrations applied");
                    return;
                }
                Err(e) => {
                    let secs = 2u64.pow(attempt.min(6));
                    tracing::warn!(
                        "Migration attempt {attempt}/10 failed: {e}. Retrying in {secs}s"
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(secs)).await;
                }
            }
        }
        tracing::error!(
            "Database migrations failed after 10 attempts — auth endpoints will be unavailable"
        );
    });

    axum::serve(listener, app).await.expect("server error");
}
