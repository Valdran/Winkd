// ── Auth ──
// Username + password auth with Argon2 hashing.
// Session tokens are opaque random strings stored in Redis.
// Phase 0: token validation is stubbed — no real DB/Redis yet.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::AppError, router::AppState};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub session_token: String,
    pub winkd_id: String,
}

pub async fn login(
    State(_state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // TODO Phase 1: verify against PostgreSQL + Argon2 hash
    // Stub: accept any credentials in dev, return a random token
    if body.username.is_empty() || body.password.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let token = Uuid::new_v4().to_string();
    let winkd_id = format!("{}#{:04}", body.username, rand::random::<u16>() % 10000);

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id,
    }))
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: String,
}

pub async fn register(
    State(_state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // TODO Phase 1: hash password with Argon2, store in PostgreSQL, generate PreKey bundle
    if body.username.is_empty() || body.password.len() < 8 {
        return Err(AppError::Internal("Invalid registration data".into()));
    }

    let token = Uuid::new_v4().to_string();
    let winkd_id = format!("{}#{:04}", body.username, rand::random::<u16>() % 10000);

    tracing::info!("Registered new user: {} ({})", body.display_name, winkd_id);

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id,
    }))
}
