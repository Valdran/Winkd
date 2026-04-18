// ── Router ──
// Wires up all HTTP + WebSocket routes.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{State, WebSocketUpgrade},
    response::Response,
    routing::{get, get_service, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{timeout, Duration};
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
    ratelimit::RateLimiter,
};

/// A live WebSocket session for a given user — the sender channel plus a
/// per-connection UUID so disconnect cleanup can tell its own registration
/// apart from a newer one that replaced it.
#[derive(Clone)]
pub struct ClientSession {
    pub session_id: Uuid,
    pub sender: mpsc::UnboundedSender<String>,
}

/// Live WebSocket sessions, keyed by user UUID.
pub type ConnectedClients = Arc<RwLock<HashMap<Uuid, ClientSession>>>;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: DbPool,
    pub presence: PresenceStore,
    pub clients: ConnectedClients,
    /// Rate limiter for POST /api/auth/login — 10 attempts / minute per IP.
    pub login_limiter: RateLimiter,
    /// Rate limiter for POST /api/auth/register — 5 attempts / minute per IP.
    pub register_limiter: RateLimiter,
}

pub async fn build_router(config: Config, db: DbPool) -> Router {
    let state = AppState {
        config: config.clone(),
        db,
        presence: PresenceStore::default(),
        clients: Arc::new(RwLock::new(HashMap::new())),
        login_limiter: RateLimiter::new(10, 60),
        register_limiter: RateLimiter::new(5, 60),
    };

    Router::new()
        // Health
        .route("/health", get(health))
        // Auth — password + OAuth
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/register", post(auth::register))
        .route(
            "/api/auth/password-reset/request",
            post(auth::password_reset_request),
        )
        .route("/api/auth/oauth/providers", get(auth::oauth_providers))
        .route("/api/auth/oauth/:provider/start", get(auth::oauth_start))
        .route(
            "/api/auth/oauth/:provider/callback",
            get(auth::oauth_callback),
        )
        // Auth — 2FA / TOTP
        .route("/api/auth/totp/challenge", post(auth::totp_challenge))
        .route("/api/auth/totp/setup", post(auth::totp_setup))
        .route("/api/auth/totp/confirm", post(auth::totp_confirm))
        .route("/api/auth/totp/disable", post(auth::totp_disable))
        // Auth — recovery codes
        .route("/api/auth/recovery-codes", get(auth::recovery_codes_status))
        .route(
            "/api/auth/recovery-codes/generate",
            post(auth::recovery_codes_generate),
        )
        // Devices
        .route("/api/devices", get(auth::list_devices))
        .route(
            "/api/devices/:device_id",
            axum::routing::delete(auth::revoke_device),
        )
        // Pre-key bundles (Signal Protocol X3DH)
        .route("/api/keys/bundle", post(auth::upload_pre_key_bundle))
        .route(
            "/api/keys/bundle/:winkd_id",
            get(auth::fetch_pre_key_bundle),
        )
        // Audit log (authenticated user's own events)
        .route("/api/security/audit-log", get(auth::get_audit_log))
        // Buy Me a Coffee webhook — grants Max tier / emoji-pack extras.
        .route("/api/bmac/webhook", post(crate::bmac::webhook))
        // WebSocket messaging endpoint (token sent as first message, NOT in URL)
        .route("/ws", get(ws_handler))
        // Root: serve landing page
        .route_service(
            "/",
            get_service(ServeFile::new("web-dist/winkd_website.html")),
        )
        // Frontend static files
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

// ── WebSocket handler ──────────────────────────────────────────────────────
// The session token is NO LONGER passed as a URL query parameter (?token=…).
// Instead the client sends it as the very first WebSocket message:
//   { "type": "auth", "token": "<hex-session-token>" }
// The server replies with { "type": "auth_ok" } and then enters the normal
// message loop, or closes with code 4001 if auth fails / times out.

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    // Raise frame/message caps so Max-tier supporters can send ~10 MB
    // attachments (which inflate to ~13 MB after base64) without tripping
    // tokio-tungstenite's 16 MiB default. The tier-aware payload validator
    // still enforces the actual per-user attachment limit.
    ws.max_frame_size(crate::limits::WS_MAX_FRAME_BYTES)
        .max_message_size(crate::limits::WS_MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    use axum::extract::ws::Message;

    #[derive(serde::Deserialize)]
    struct WsAuthMessage {
        #[serde(rename = "type")]
        msg_type: String,
        token: String,
    }

    let (mut ws_tx, mut ws_rx) = socket.split();

    // ── Step 1: Authenticate — must receive auth message within 5 seconds ──
    let user = match timeout(Duration::from_secs(5), ws_rx.next()).await {
        Ok(Some(Ok(Message::Text(text)))) => match serde_json::from_str::<WsAuthMessage>(&text) {
            Ok(auth) if auth.msg_type == "auth" => {
                match db::find_user_by_session(&state.db, &auth.token).await {
                    Ok(Some(u)) => u,
                    _ => {
                        let _ = ws_tx
                            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                code: 4001,
                                reason: "Unauthorized".into(),
                            })))
                            .await;
                        tracing::warn!("WS rejected: invalid or expired session token");
                        return;
                    }
                }
            }
            _ => {
                let _ = ws_tx
                    .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                        code: 4001,
                        reason: "Expected auth message".into(),
                    })))
                    .await;
                tracing::warn!("WS rejected: first message was not a valid auth frame");
                return;
            }
        },
        _ => {
            let _ = ws_tx
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4001,
                    reason: "Auth timeout".into(),
                })))
                .await;
            tracing::warn!("WS rejected: no auth message within 5 s");
            return;
        }
    };

    // ── Step 2: Confirm authentication ─────────────────────────────────────
    // Echo the user's effective supporter tier and the matching limits so the
    // web client can render the right character counter and pre-flight-check
    // attachment sizes before even attempting a send. The server still
    // validates on every inbound command — these values are only a UX hint.
    let effective_tier = user.effective_tier().to_string();
    let tier_limits = crate::limits::limits_for(&effective_tier);
    if ws_tx
        .send(Message::Text(
            json!({
                "type": "auth_ok",
                "tier": effective_tier,
                "limits": tier_limits,
                "purchased_extras": user.purchased_extras,
            })
            .to_string()
            .into(),
        ))
        .await
        .is_err()
    {
        return;
    }

    tracing::info!("WS connected: {} ({})", user.display_name, user.winkd_id);

    let (chan_tx, mut chan_rx) = mpsc::unbounded_channel::<String>();

    // Register the live sender so other handlers can push events to this user.
    // A per-connection session_id lets cleanup distinguish this registration
    // from a later connection that replaced it (e.g. page refresh, roaming,
    // or a second tab) so we don't wipe the newer session's entry.
    let session_id = Uuid::new_v4();
    state.clients.write().await.insert(
        user.id,
        ClientSession {
            session_id,
            sender: chan_tx.clone(),
        },
    );

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
    broadcast_presence_to_contacts(&state, &user, "online").await;

    // Flush any pending inbound contact requests that arrived while offline.
    if let Ok(contacts) = db::list_contact_roster(&state.db, user.id).await {
        let payload = contacts
            .iter()
            .map(|c| {
                json!({
                    "winkd_id": c.winkd_id,
                    "display_name": c.display_name,
                    "avatar_data": c.avatar_data,
                    "mood_message": c.mood_message,
                    "request_status": c.request_status,
                })
            })
            .collect::<Vec<_>>();
        let _ = chan_tx.send(
            json!({
                "event": "contacts_snapshot",
                "payload": { "contacts": payload }
            })
            .to_string(),
        );
    }

    // Flush any pending inbound contact requests that arrived while offline.
    if let Ok(pending) = db::list_pending_inbound(&state.db, user.id).await {
        for req in pending {
            let event = json!({
                "event": "contact_request",
                "payload": {
                    "request_id": req.request_id,
                    "from_winkd_id": req.from_winkd_id,
                    "from_display_name": req.from_display_name,
                    "from_avatar_data": req.from_avatar_data,
                }
            });
            let _ = chan_tx.send(event.to_string());
        }
    }

    // Flush any messages that were queued while this user was offline. Each
    // stored row is the exact payload that would have been sent live, so the
    // client handles them identically to real-time messages.
    match db::drain_pending_messages(&state.db, user.id).await {
        Ok(queued) => {
            for payload in queued {
                let _ = chan_tx.send(
                    json!({ "event": "message", "payload": payload }).to_string(),
                );
            }
        }
        Err(e) => tracing::warn!("drain_pending_messages: {e}"),
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

    // Cleanup on disconnect — but only if we're still the active session.
    // If the user already reconnected on a new socket, their newer entry is in
    // state.clients under a different session_id; removing it here would strand
    // the live connection and silently drop every inbound message to them.
    let was_active_session = {
        let mut clients = state.clients.write().await;
        match clients.get(&user.id) {
            Some(s) if s.session_id == session_id => {
                clients.remove(&user.id);
                true
            }
            _ => false,
        }
    };

    if was_active_session {
        state.presence.remove(&user.id.to_string()).await;
        broadcast_presence_to_contacts(&state, &user, "offline").await;
    }
    send_task.abort();

    tracing::info!(
        "WS disconnected: {} (active_session={})",
        user.winkd_id,
        was_active_session
    );
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
            let target_id = cmd
                .payload
                .get("winkd_id")
                .or_else(|| cmd.payload.get("winkdId"))
                .or_else(|| cmd.payload.get("target_winkd_id"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(str::to_string);

            let Some(target_id) = target_id else {
                send_err(
                    tx,
                    "Missing Winkd ID. Please enter an ID like friend#1234 and try again.",
                );
                return;
            };

            if target_id == user.winkd_id {
                send_err(tx, "You can't add yourself.");
                return;
            }

            match db::find_user_by_winkd_id(&state.db, &target_id).await {
                Ok(Some(target)) => {
                    match db::is_blocked_between(&state.db, user.id, target.id).await {
                        Ok(true) => {
                            send_err(tx, "Contact request could not be sent.");
                            return;
                        }
                        Ok(false) => {}
                        Err(e) => {
                            tracing::warn!("is_blocked_between error: {e}");
                            send_err(tx, "Server error. Please try again.");
                            return;
                        }
                    }

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
                                        "to_avatar_data": target.avatar_data,
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
                                    "from_avatar_data": user.avatar_data.clone(),
                                }
                            })
                            .to_string();

                            if let Some(target_session) =
                                state.clients.read().await.get(&target.id).cloned()
                            {
                                let _ = target_session.sender.send(event);
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
                                        "avatar_data": requester.avatar_data,
                                        "mood_message": requester.mood_message,
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
                                    "avatar_data": user.avatar_data,
                                    "mood_message": user.mood_message,
                                }
                            })
                            .to_string();

                            if let Some(req_session) =
                                state.clients.read().await.get(&requester.id).cloned()
                            {
                                let _ = req_session.sender.send(event);
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

        // ── Reject contact ─────────────────────────────────────────────────
        ClientCommandType::RejectContact => {
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

            match db::reject_contact_request(&state.db, request_id, user.id).await {
                Ok(req) => {
                    let _ = tx.send(
                        json!({
                            "event": "contact_request_rejected",
                            "payload": { "request_id": req.id }
                        })
                        .to_string(),
                    );
                }
                Err(e) => {
                    tracing::warn!("reject_contact_request error: {e}");
                    send_err(tx, "Could not reject contact request.");
                }
            }
        }

        // ── Block contact ──────────────────────────────────────────────────
        ClientCommandType::BlockContact => {
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

            let pending = match db::list_pending_inbound(&state.db, user.id).await {
                Ok(list) => list,
                Err(e) => {
                    tracing::warn!("list_pending_inbound error before block: {e}");
                    send_err(tx, "Could not block user.");
                    return;
                }
            };
            let Some(req) = pending.iter().find(|r| r.request_id == request_id) else {
                send_err(tx, "Contact request not found.");
                return;
            };

            if let Err(e) = db::create_block(&state.db, user.id, req.from_user_id).await {
                tracing::warn!("create_block error: {e}");
                send_err(tx, "Could not block user.");
                return;
            }

            if let Err(e) =
                db::clear_pending_contact_requests_between(&state.db, user.id, req.from_user_id)
                    .await
            {
                tracing::warn!("clear_pending_contact_requests_between error: {e}");
            }

            let _ = tx.send(
                json!({
                    "event": "contact_blocked",
                    "payload": {
                        "request_id": request_id,
                        "user_id": req.from_user_id,
                        "winkd_id": req.from_winkd_id.clone(),
                        "display_name": req.from_display_name.clone(),
                        "avatar_data": req.from_avatar_data.clone(),
                        "blocked_at": chrono::Utc::now(),
                    }
                })
                .to_string(),
            );
        }

        // ── Block a user by Winkd ID (from an active chat/contact) ───────
        ClientCommandType::BlockUser => {
            let target_winkd_id = match cmd.payload.get("winkd_id").and_then(|v| v.as_str()) {
                Some(s) => s.trim(),
                None => return,
            };

            if target_winkd_id == user.winkd_id {
                send_err(tx, "You cannot block yourself.");
                return;
            }

            let target = match db::find_user_by_winkd_id(&state.db, target_winkd_id).await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    send_err(tx, "User not found.");
                    return;
                }
                Err(e) => {
                    tracing::warn!("find_user_by_winkd_id error on block_user: {e}");
                    send_err(tx, "Could not block user.");
                    return;
                }
            };

            if let Err(e) = db::create_block(&state.db, user.id, target.id).await {
                tracing::warn!("create_block error on block_user: {e}");
                send_err(tx, "Could not block user.");
                return;
            }

            if let Err(e) =
                db::clear_pending_contact_requests_between(&state.db, user.id, target.id).await
            {
                tracing::warn!("clear_pending_contact_requests_between on block_user: {e}");
            }

            let _ = tx.send(
                json!({
                    "event": "contact_blocked",
                    "payload": {
                        "user_id": target.id,
                        "winkd_id": target.winkd_id,
                        "display_name": target.display_name,
                        "avatar_data": target.avatar_data,
                        "blocked_at": chrono::Utc::now(),
                    }
                })
                .to_string(),
            );
        }

        // ── Unblock contact ────────────────────────────────────────────────
        ClientCommandType::UnblockContact => {
            let user_id_str = match cmd.payload.get("user_id").and_then(|v| v.as_str()) {
                Some(s) => s.to_string(),
                None => return,
            };
            let blocked_id = match Uuid::parse_str(&user_id_str) {
                Ok(id) => id,
                Err(_) => {
                    send_err(tx, "Invalid user ID.");
                    return;
                }
            };

            match db::remove_block(&state.db, user.id, blocked_id).await {
                Ok(()) => {
                    let _ = tx.send(
                        json!({
                            "event": "contact_unblocked",
                            "payload": { "user_id": blocked_id }
                        })
                        .to_string(),
                    );
                }
                Err(e) => {
                    tracing::warn!("remove_block error: {e}");
                    send_err(tx, "Could not unblock user.");
                }
            }
        }

        // ── List blocked users ─────────────────────────────────────────────
        ClientCommandType::ListBlocked => match db::list_blocked_users(&state.db, user.id).await {
            Ok(users) => {
                let payload = users
                    .iter()
                    .map(|u| {
                        json!({
                            "user_id": u.user_id,
                            "winkd_id": u.winkd_id,
                            "display_name": u.display_name,
                            "avatar_data": u.avatar_data,
                            "blocked_at": u.blocked_at,
                        })
                    })
                    .collect::<Vec<_>>();

                let _ = tx.send(
                    json!({
                        "event": "blocked_list",
                        "payload": { "users": payload }
                    })
                    .to_string(),
                );
            }
            Err(e) => {
                tracing::warn!("list_blocked_users error: {e}");
                send_err(tx, "Could not list blocked users.");
            }
        },

        // ── Set mood ───────────────────────────────────────────────────────
        ClientCommandType::SetMood => {
            let mood = match cmd.payload.get("mood").and_then(|v| v.as_str()) {
                Some(m) => m.chars().take(100).collect::<String>(),
                None => return,
            };

            if let Err(e) = db::update_user_mood(&state.db, user.id, &mood).await {
                tracing::warn!("update mood for {}: {e}", user.winkd_id);
            }

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

            if let Err(e) =
                db::update_user_display_name(&state.db, user.id, &name, name_color, av_color).await
            {
                tracing::warn!("update display_name for {}: {e}", user.winkd_id);
            }
        }

        // ── Set avatar ─────────────────────────────────────────────────────
        ClientCommandType::SetAvatar => {
            let avatar_data = cmd.payload.get("avatar_data").and_then(|v| v.as_str());
            if let Err(e) = db::update_user_avatar(&state.db, user.id, avatar_data).await {
                tracing::warn!("update avatar for {}: {e}", user.winkd_id);
            }
        }

        // ── Set profile style ──────────────────────────────────────────────
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
            let outbound = if status_str == "invisible" {
                "offline"
            } else {
                status_str.as_str()
            };
            broadcast_presence_to_contacts(state, user, outbound).await;
        }

        // ── Message relay (text / winkd / nudge / wink) ───────────────────
        ClientCommandType::SendMessage
        | ClientCommandType::SendWinkd
        | ClientCommandType::SendNudge
        | ClientCommandType::SendWink => {
            // Enforce the sender's tier-aware size caps before we do anything
            // else. A tampered client can send huge payloads even though the
            // web UI won't let them compose one, so this is the real gate.
            let tier = user.effective_tier();
            let limits = crate::limits::limits_for(tier);
            if let Err(violation) = crate::limits::validate_send_payload(&cmd.payload, &limits) {
                send_err(tx, &violation.user_message(tier));
                return;
            }

            // The client sets conversationId = the other person's winkd_id.
            let recipient_winkd_id = cmd
                .payload
                .get("conversationId")
                .or_else(|| cmd.payload.get("conversation_id"))
                .or_else(|| cmd.payload.get("recipient_winkd_id"))
                .or_else(|| cmd.payload.get("recipientId"))
                .or_else(|| cmd.payload.get("recipient_id"))
                .and_then(|v| v.as_str())
                .map(str::to_string);

            let Some(recipient_winkd_id) = recipient_winkd_id else {
                return;
            };

            match db::find_user_by_winkd_id(&state.db, &recipient_winkd_id).await {
                Ok(Some(recipient)) => {
                    let mut sender_payload = cmd.payload.clone();
                    sender_payload["conversationId"] = json!(recipient_winkd_id.clone());
                    sender_payload["senderId"] = json!(user.winkd_id.clone());

                    // Build the forwarded payload once — used either for live
                    // delivery or for the offline queue, so the recipient sees
                    // the same shape in both cases.
                    let mut forwarded = cmd.payload.clone();
                    forwarded["conversationId"] = json!(user.winkd_id);
                    forwarded["senderId"] = json!(user.winkd_id);
                    forwarded["delivered"] = json!(true);

                    let client_msg_id = cmd
                        .payload
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);

                    let live_session =
                        state.clients.read().await.get(&recipient.id).cloned();

                    let delivered_live = match live_session {
                        Some(session) => session
                            .sender
                            .send(
                                json!({
                                    "event": "message",
                                    "payload": forwarded.clone(),
                                })
                                .to_string(),
                            )
                            .is_ok(),
                        None => false,
                    };

                    if !delivered_live {
                        // Either no connection, or the channel was closed
                        // between the lookup and the send (e.g. the recipient
                        // is mid-reconnect). Either way, queue it so they
                        // receive it on next auth instead of dropping it.
                        if let Err(e) = db::queue_pending_message(
                            &state.db,
                            recipient.id,
                            user.id,
                            client_msg_id.as_deref(),
                            &forwarded,
                        )
                        .await
                        {
                            tracing::warn!("queue_pending_message: {e}");
                        }
                    }

                    sender_payload["delivered"] = json!(delivered_live);

                    let _ = tx.send(
                        json!({
                            "event": "message",
                            "payload": sender_payload,
                        })
                        .to_string(),
                    );
                }
                Ok(None) => {
                    tracing::debug!(
                        "relay_message: recipient '{}' not found",
                        recipient_winkd_id
                    );
                }
                Err(e) => {
                    tracing::warn!("relay_message: db error: {e}");
                }
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

async fn broadcast_presence_to_contacts(state: &AppState, user: &db::User, status: &str) {
    let contact_ids = match db::list_accepted_contact_user_ids(&state.db, user.id).await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::warn!(
                "list_accepted_contact_user_ids error for {}: {e}",
                user.winkd_id
            );
            return;
        }
    };

    if contact_ids.is_empty() {
        return;
    }

    let msg = json!({
        "event": "presence",
        "payload": {
            "user_id": user.winkd_id,
            "status": status,
        }
    })
    .to_string();

    let clients = state.clients.read().await;
    for contact_id in contact_ids {
        if let Some(session) = clients.get(&contact_id) {
            let _ = session.sender.send(msg.clone());
        }
    }
}
