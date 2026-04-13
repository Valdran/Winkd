// ── Winkd Server ──
// Phase 1: Axum server with PostgreSQL auth, WebSocket relay, and OAuth.

mod auth;
mod config;
mod db;
mod error;
mod presence;
mod protocol;
mod router;

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

    // Connect to PostgreSQL and run pending migrations
    let pool = db::connect(&cfg.database_url)
        .await
        .expect("Failed to connect to PostgreSQL — is DATABASE_URL set correctly?");

    db::run_migrations(&pool)
        .await
        .expect("Database migration failed");

    info!("Database connected and migrations applied");

    let addr: SocketAddr = cfg.listen_addr.parse().expect("Invalid LISTEN_ADDR");
    let app = router::build_router(cfg, pool).await;

    info!("Winkd server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
}
