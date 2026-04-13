// ── Winkd Server ──
// Phase 0 skeleton. Boots an Axum server with a WebSocket upgrade endpoint,
// a health-check route, and stubs for auth + message relay.

mod auth;
mod config;
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
    let addr: SocketAddr = cfg.listen_addr.parse().expect("Invalid LISTEN_ADDR");

    let app = router::build_router(cfg).await;

    info!("Winkd server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
}
