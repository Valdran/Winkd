// ── Router ──
// Wires up all HTTP + WebSocket routes.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Query, State, WebSocketUpgrade},
    response::Response,
    routing::{get, get_service, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{mpsc, RwLock};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    auth,
    config::Config,
    db,
    db::DbPool,
    presence::PresenceStore,
    protocol::{ClientCommand, ClientCommandType},
};

/// Live WebSocket senders, keyed by user UUID.
pub type ConnectedClients = Arc<RwLock<HashMap<Uuid, mpsc::UnboundedSender<String>>>>;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: DbPool,
    pub presence: PresenceStore,
    pub clients: ConnectedClients,
}

pub async fn build_router(config: Config, db: DbPool) -> Router {
    let state = AppState {
        config: config.clone(),
        db,
        presence: PresenceStore::default(),
        clients: Arc::new(RwLock::new(HashMap::new())),
    };

    Router::new()
        // Health
        .route("/health", get(health))
        // Auth
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/oauth/providers", get(auth::oauth_providers))
        .route("/api/auth/oauth/:provider/start", get(auth::oauth_start))
        .route(
            "/api/auth/oauth/:provider/callback",
            get(auth::oauth_callback),
        )
        // WebSocket messaging endpoint
        .route("/ws", get(ws_handler))
        // Root: serve landing page
        .route_service("/", get_service(ServeFile::new("web-dist/winkd_website.html")))
        // Frontend static files — fallback_service avoids the route conflict that
        // nest_service("/", …) causes in Axum 0.7 when "/" is already registered above.
        .fallback_service(get_service(
            ServeDir::new("web-dist")
                .not_found_service(ServeFile::new("web-dist/winkd_website.html")),
        ))
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

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Response {
    let token = params.get("token").cloned().unwrap_or_default();
    ws.on_upgrade(move |socket| handle_socket(socket, state, token))
}

async fn handle_socket(
    socket: axum::extract::ws::WebSocket,
    state: AppState,
    token: String,
) {
    use axum::extract::ws::Message;

    // Authenticate before doing anything else.
    let user = match db::find_user_by_session(&state.db, &token).await {
        Ok(Some(u)) => u,
        _ => {
            tracing::warn!("WS rejected: invalid or expired session token");
            return;
        }
    };

    tracing::info!("WS connected: {} ({})", user.display_name, user.winkd_id);

    let (mut ws_tx, mut ws_rx) = socket.split();
    let (chan_tx, mut chan_rx) = mpsc::unbounded_channel::<String>();

    // Register the live sender so other handlers can push events to this user.
    state.clients.write().await.insert(user.id, chan_tx.clone());

    // Mark online in presence store, seeding mood from the DB so it survives restarts.
    state
        .presence
        .set(
            &user.id.to_string(),
            crate::presence::PresenceEntry {
                status: crate::presence::UserStatus::Online,
                mood: user.mood_message.clone(),
            },
        )
        .await;

    // Flush any pending inbound contact requests that arrived while offline.
    if let Ok(pending) = db::list_pending_inbound(&state.db, user.id).await {
        for req in pending {
            let event = json!({
                "event": "contact_request",
                "payload": {
                    "request_id": req.request_id,
                    "from_winkd_id": req.from_winkd_id,
                    "from_display_name": req.from_display_name,
                }
            });
            let _ = chan_tx.send(event.to_string());
        }
    }

    // Spawn a task that forwards channel messages to the WebSocket.
    let send_task = tokio::spawn(async move {
        while let Some(msg) = chan_rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Main receive loop.
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Text(text) => match serde_json::from_str::<ClientCommand>(&text) {
                Ok(cmd) => handle_command(&state, &user, &chan_tx, cmd).await,
                Err(e) => tracing::debug!("WS parse error from {}: {e}", user.winkd_id),
            },
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup on disconnect.
    state.clients.write().await.remove(&user.id);
    state.presence.remove(&user.id.to_string()).await;
    send_task.abort();

    tracing::info!("WS disconnected: {}", user.winkd_id);
}

async fn handle_command(
    state: &AppState,
    user: &db::User,
    tx: &mpsc::UnboundedSender<String>,
    cmd: ClientCommand,
) {
    match cmd.command {
        // ── Add contact ────────────────────────────────────────────────────
        ClientCommandType::AddContact => {
            let target_id = match cmd.payload.get("winkd_id").and_then(|v| v.as_str()) {
                Some(id) if !id.is_empty() => id.to_string(),
                _ => return,
            };

            if target_id == user.winkd_id {
                send_err(tx, "You can't add yourself.");
                return;
            }

            match db::find_user_by_winkd_id(&state.db, &target_id).await {
                Ok(Some(target)) => {
                    match db::create_contact_request(&state.db, user.id, target.id).await {
                        Ok(req) => {
                            // Acknowledge the sender.
                            let _ = tx.send(
                                json!({
                                    "event": "contact_request_sent",
                                    "payload": {
                                        "request_id": req.id,
                                        "to_winkd_id": target_id,
                                        "to_display_name": target.display_name,
                                    }
                                })
                                .to_string(),
                            );

                            // Push notification to target if they are online right now.
                            let event = json!({
                                "event": "contact_request",
                                "payload": {
                                    "request_id": req.id,
                                    "from_winkd_id": user.winkd_id,
                                    "from_display_name": user.display_name,
                                }
                            })
                            .to_string();

                            if let Some(target_chan) =
                                state.clients.read().await.get(&target.id).cloned()
                            {
                                let _ = target_chan.send(event);
                            }
                        }
                        Err(e) => {
                            tracing::warn!("create_contact_request error: {e}");
                            send_err(
                                tx,
                                "Could not send contact request. You may have already sent one.",
                            );
                        }
                    }
                }
                Ok(None) => send_err(tx, "No user found with that Winkd ID."),
                Err(e) => {
                    tracing::warn!("find_user_by_winkd_id error: {e}");
                    send_err(tx, "Server error. Please try again.");
                }
            }
        }

        // ── Accept contact ─────────────────────────────────────────────────
        ClientCommandType::AcceptContact => {
            let request_id_str = match cmd.payload.get("request_id").and_then(|v| v.as_str()) {
                Some(s) => s.to_string(),
                None => return,
            };
            let request_id = match Uuid::parse_str(&request_id_str) {
                Ok(id) => id,
                Err(_) => {
                    send_err(tx, "Invalid request ID.");
                    return;
                }
            };

            match db::accept_contact_request(&state.db, request_id, user.id).await {
                Ok(req) => {
                    match db::find_user_by_id(&state.db, req.from_id).await {
                        Ok(Some(requester)) => {
                            // Tell the acceptor (self) the requester's details.
                            let _ = tx.send(
                                json!({
                                    "event": "contact_accepted",
                                    "payload": {
                                        "winkd_id": requester.winkd_id,
                                        "display_name": requester.display_name,
                                    }
                                })
                                .to_string(),
                            );

                            // Tell the requester (if online) that their request was accepted.
                            let event = json!({
                                "event": "contact_accepted",
                                "payload": {
                                    "winkd_id": user.winkd_id,
                                    "display_name": user.display_name,
                                }
                            })
                            .to_string();

                            if let Some(req_chan) =
                                state.clients.read().await.get(&requester.id).cloned()
                            {
                                let _ = req_chan.send(event);
                            }
                        }
                        _ => {
                            tracing::warn!(
                                "Could not find requester for contact request {}",
                                req.id
                            );
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("accept_contact_request error: {e}");
                    send_err(tx, "Could not accept contact request.");
                }
            }
        }

        // ── Set mood ───────────────────────────────────────────────────────
        ClientCommandType::SetMood => {
            let mood = match cmd.payload.get("mood").and_then(|v| v.as_str()) {
                Some(m) => m.chars().take(100).collect::<String>(),
                None => return,
            };

            // Persist only the mood column — never touch display_name here.
            if let Err(e) = db::update_user_mood(&state.db, user.id, &mood).await {
                tracing::warn!("update mood for {}: {e}", user.winkd_id);
            }

            // Update live presence
            if let Some(mut entry) = state.presence.get(&user.id.to_string()).await {
                entry.mood = mood;
                state.presence.set(&user.id.to_string(), entry).await;
            }
        }

        // ── Set display name ───────────────────────────────────────────────
        ClientCommandType::SetDisplayName => {
            let name = match cmd.payload.get("display_name").and_then(|v| v.as_str()) {
                Some(n) if !n.trim().is_empty() => n.trim().chars().take(64).collect::<String>(),
                _ => return,
            };
            let name_color = cmd.payload.get("name_color").and_then(|v| v.as_str());
            let av_color = cmd.payload.get("av_color").and_then(|v| v.as_str());

            if let Err(e) = db::update_user_display_name(
                &state.db, user.id, &name, name_color, av_color,
            )
            .await
            {
                tracing::warn!("update display_name for {}: {e}", user.winkd_id);
            }
        }

        // ── Set avatar ─────────────────────────────────────────────────────
        ClientCommandType::SetAvatar => {
            // avatar_data may be null (to remove the avatar)
            let avatar_data = cmd.payload.get("avatar_data").and_then(|v| v.as_str());
            if let Err(e) = db::update_user_avatar(&state.db, user.id, avatar_data).await {
                tracing::warn!("update avatar for {}: {e}", user.winkd_id);
            }
        }

        // ── Set profile style (colours only) ───────────────────────────────
        ClientCommandType::SetProfileStyle => {
            let name_color = cmd.payload.get("name_color").and_then(|v| v.as_str());
            let av_color = cmd.payload.get("av_color").and_then(|v| v.as_str());
            if let Err(e) =
                db::update_user_profile_style(&state.db, user.id, name_color, av_color).await
            {
                tracing::warn!("update profile style for {}: {e}", user.winkd_id);
            }
        }

        // ── Set status ─────────────────────────────────────────────────────
        ClientCommandType::SetStatus => {
            let status_str = match cmd.payload.get("status").and_then(|v| v.as_str()) {
                Some(s) => s.to_string(),
                None => return,
            };
            let status = match status_str.as_str() {
                "away" => crate::presence::UserStatus::Away,
                "busy" => crate::presence::UserStatus::Busy,
                "invisible" => crate::presence::UserStatus::Invisible,
                _ => crate::presence::UserStatus::Online,
            };
            if let Some(mut entry) = state.presence.get(&user.id.to_string()).await {
                entry.status = status;
                state.presence.set(&user.id.to_string(), entry).await;
            }
        }

        other => {
            tracing::debug!("Unhandled WS command from {}: {other:?}", user.winkd_id);
        }
    }
}

fn send_err(tx: &mpsc::UnboundedSender<String>, message: &str) {
    let _ = tx.send(
        json!({
            "event": "error",
            "payload": { "message": message }
        })
        .to_string(),
    );
}
