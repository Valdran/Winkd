// ── Router ──
// Wires up all HTTP + WebSocket routes.

use axum::{
    extract::{State, WebSocketUpgrade},
    response::Response,
    routing::{get, get_service, post},
    Json, Router,
};
use serde_json::json;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use crate::{auth, config::Config, presence::PresenceStore};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub presence: PresenceStore,
}

pub async fn build_router(config: Config) -> Router {
    let state = AppState {
        config: config.clone(),
        presence: PresenceStore::default(),
    };

    Router::new()
        // Health
        .route("/health", get(health))
        // Auth
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/oauth/:provider/start", get(auth::oauth_start))
        .route(
            "/api/auth/oauth/:provider/callback",
            get(auth::oauth_callback),
        )
        // WebSocket messaging endpoint
        .route("/ws", get(ws_handler))
        // Frontend static files (SPA)
        .nest_service(
            "/",
            get_service(
                ServeDir::new("web-dist").not_found_service(ServeFile::new("web-dist/index.html")),
            ),
        )
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST]),
        )
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let online = state.presence.online_count().await;
    Json(json!({
        "status": "ok",
        "online_users": online,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, _state: AppState) {
    // Phase 0 stub: echo messages back so the connection can be tested
    use axum::extract::ws::Message;
    use futures_util::{SinkExt, StreamExt};

    tracing::debug!("WebSocket client connected");

    let (mut sender, mut receiver) = socket.split();

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                tracing::debug!("WS recv: {text}");
                // TODO Phase 1: parse ClientCommand, decrypt envelope, relay to recipient
                let echo = json!({
                    "event": "echo",
                    "payload": { "text": text }
                });
                if sender
                    .send(Message::Text(echo.to_string().into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Message::Close(_) => {
                tracing::debug!("WebSocket client disconnected");
                break;
            }
            _ => {}
        }
    }
}
