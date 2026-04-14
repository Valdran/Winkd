// ── Auth ──
// Username + password auth with Argon2 hashing.
// Session tokens are opaque random strings stored in PostgreSQL.
// OAuth flow uses provider-specific authorization/token endpoints with PKCE + state.

use std::{
    collections::HashMap,
    env,
    time::{SystemTime, UNIX_EPOCH},
};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse,
    TokenUrl,
};
use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use crate::{audit, db, error::AppError, ratelimit::extract_ip, router::AppState, totp};

// ── Request / Response types ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: String,
    pub email: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub session_token: String,
    pub winkd_id: String,
    pub display_name: String,
    pub mood_message: String,
    pub avatar_data: Option<String>,
    pub display_name_color: Option<String>,
    pub av_color: Option<String>,
}

#[derive(Serialize)]
pub struct OAuthProvidersResponse {
    pub providers: Vec<&'static str>,
}

// ── Login ──────────────────────────────────────────────────────────────────

pub async fn login(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Response, AppError> {
    let ip = extract_ip(&headers).to_string();

    // Rate-limit by client IP: 10 attempts per minute.
    if !state.login_limiter.check(extract_ip(&headers)).await {
        return Err(AppError::TooManyRequests);
    }

    let input = body.username.trim();
    if input.is_empty() || body.password.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let pool = &state.db;

    // Accept either a username or an email address in the username field.
    let user = if input.contains('@') {
        db::find_user_by_email(pool, input)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
    } else {
        db::find_user_by_username(pool, input)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
    };

    let user = match user {
        Some(u) => u,
        None => {
            audit::log(pool, None, audit::Action::LoginFailed, Some(&ip),
                serde_json::json!({ "reason": "unknown_user" })).await;
            return Err(AppError::Unauthorized);
        }
    };

    // OAuth-only accounts have no password hash — reject password login attempts.
    let hash = match user.password_hash.as_deref() {
        Some(h) => h.to_string(),
        None => {
            audit::log(pool, Some(user.id), audit::Action::LoginFailed, Some(&ip),
                serde_json::json!({ "reason": "oauth_only_account" })).await;
            return Err(AppError::Unauthorized);
        }
    };

    let parsed = PasswordHash::new(&hash).map_err(|_| AppError::Unauthorized)?;
    if make_argon2()
        .map_err(|e| AppError::Internal(format!("Argon2 init: {e}")))?
        .verify_password(body.password.as_bytes(), &parsed)
        .is_err()
    {
        audit::log(pool, Some(user.id), audit::Action::LoginFailed, Some(&ip),
            serde_json::json!({ "reason": "wrong_password" })).await;
        return Err(AppError::Unauthorized);
    }

    // ── 2FA check ─────────────────────────────────────────────────────────
    if user.totp_enabled {
        let challenge_token = db::create_totp_challenge(pool, user.id)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        audit::log(pool, Some(user.id), audit::Action::TotpChallengeIssued, Some(&ip),
            serde_json::json!({})).await;
        return Ok(Json(serde_json::json!({
            "totp_required": true,
            "challenge_token": challenge_token,
        }))
        .into_response());
    }

    // ── No 2FA — create session immediately ───────────────────────────────
    let token = db::create_session(pool, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user.id), audit::Action::Login, Some(&ip),
        serde_json::json!({})).await;

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id: user.winkd_id,
        display_name: user.display_name,
        mood_message: user.mood_message,
        avatar_data: user.avatar_data,
        display_name_color: user.display_name_color,
        av_color: user.av_color,
    })
    .into_response())
}

// ── Register ───────────────────────────────────────────────────────────────

pub async fn register(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // Rate-limit by client IP: 5 registrations per minute.
    if !state.register_limiter.check(extract_ip(&headers)).await {
        return Err(AppError::TooManyRequests);
    }

    let username = sanitize_id_part(body.username.trim());

    if username.len() < 3 {
        return Err(AppError::Internal(
            "Username must be at least 3 characters".into(),
        ));
    }

    validate_password(&body.password)?;

    let pool = &state.db;

    // Uniqueness checks
    if db::find_user_by_username(pool, &username)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .is_some()
    {
        return Err(AppError::Conflict("Username already taken".into()));
    }

    let email = body
        .email
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let Some(e) = email {
        if db::find_user_by_email(pool, e)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .is_some()
        {
            return Err(AppError::Conflict("Email already registered".into()));
        }
    }

    // Hash password with Argon2id (128 MB memory, 4 iterations)
    let salt = SaltString::generate(&mut OsRng);
    let hash = make_argon2()
        .map_err(|e| AppError::Internal(format!("Argon2 init: {e}")))?
        .hash_password(body.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Password hashing failed: {e}")))?
        .to_string();

    // Generate a unique Winkd ID
    let winkd_id = db::unique_winkd_id(pool, &username)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let display_name = if body.display_name.trim().is_empty() {
        username.clone()
    } else {
        body.display_name.trim().to_string()
    };

    let user = db::create_user(pool, &username, &winkd_id, &display_name, email, Some(&hash))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let token = db::create_session(pool, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    tracing::info!("Registered new user: {} ({})", user.display_name, user.winkd_id);
    let ip = extract_ip(&headers).to_string();
    audit::log(&state.db, Some(user.id), audit::Action::Register, Some(&ip),
        serde_json::json!({ "winkd_id": user.winkd_id })).await;

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id: user.winkd_id,
        display_name: user.display_name,
        mood_message: user.mood_message,
        avatar_data: user.avatar_data,
        display_name_color: user.display_name_color,
        av_color: user.av_color,
    }))
}

// ── OAuth providers list ───────────────────────────────────────────────────

pub async fn oauth_providers() -> Json<OAuthProvidersResponse> {
    let providers = OAuthProvider::all()
        .iter()
        .copied()
        .filter(|p| p.is_configured())
        .map(OAuthProvider::slug)
        .collect();

    Json(OAuthProvidersResponse { providers })
}

// ── OAuth start ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    code: String,
    state: String,
}

pub async fn oauth_start(Path(provider): Path<String>) -> Result<Response, AppError> {
    let provider = OAuthProvider::from_slug(&provider)
        .ok_or_else(|| AppError::Internal("Unsupported OAuth provider".into()))?;

    let cfg = provider.load_env()?;
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let oauth_client = provider.client(&cfg)?;

    // Build authorization URL with provider-appropriate scopes
    let auth_request = provider
        .scopes()
        .iter()
        .fold(oauth_client.authorize_url(CsrfToken::new_random), |req, s| {
            req.add_scope(Scope::new(s.to_string()))
        })
        .set_pkce_challenge(pkce_challenge);

    let (auth_url, csrf_token) = auth_request.url();

    // Pack provider + state + pkce_verifier + timestamp into an HttpOnly cookie
    // so we can validate the callback without server-side storage.
    let cookie_val = format!(
        "{}|{}|{}|{}",
        provider.slug(),
        csrf_token.secret(),
        pkce_verifier.secret(),
        now_epoch_secs()
    );

    let set_cookie = format!(
        "winkd_oauth_state={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600",
        urlencoding::encode(&cookie_val)
    );

    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&set_cookie)
            .map_err(|_| AppError::Internal("Failed to set oauth cookie".into()))?,
    );

    Ok((headers, Redirect::temporary(auth_url.as_str())).into_response())
}

// ── OAuth callback ─────────────────────────────────────────────────────────

pub async fn oauth_callback(
    Path(provider): Path<String>,
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let provider = OAuthProvider::from_slug(&provider)
        .ok_or_else(|| AppError::Internal("Unsupported OAuth provider".into()))?;
    let cfg = provider.load_env()?;

    // Validate and unpack the state cookie
    let cookie =
        parse_cookie(&headers, "winkd_oauth_state").ok_or(AppError::Unauthorized)?;
    let decoded = urlencoding::decode(&cookie).map_err(|_| AppError::Unauthorized)?;
    let parts: Vec<&str> = decoded.split('|').collect();
    if parts.len() != 4 {
        return Err(AppError::Unauthorized);
    }
    let (cookie_provider, saved_state, pkce_verifier_secret, issued_at) =
        (parts[0], parts[1], parts[2], parts[3]);

    if cookie_provider != provider.slug() || saved_state != query.state {
        return Err(AppError::Unauthorized);
    }
    let issued_at: u64 = issued_at.parse().map_err(|_| AppError::Unauthorized)?;
    if now_epoch_secs().saturating_sub(issued_at) > 600 {
        return Err(AppError::Unauthorized);
    }

    // Exchange the authorization code for an access token
    let oauth_client = provider.client(&cfg)?;
    let token_response = oauth_client
        .exchange_code(AuthorizationCode::new(query.code.clone()))
        .set_pkce_verifier(PkceCodeVerifier::new(pkce_verifier_secret.to_string()))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::Internal(format!("Token exchange failed: {e}")))?;

    let access_token = token_response.access_token().secret().to_string();

    // Fetch user info from the provider
    let userinfo = provider.fetch_userinfo(&access_token, &cfg).await?;

    if userinfo.provider_user_id.is_empty() {
        return Err(AppError::Internal(
            "Provider returned empty user ID".into(),
        ));
    }

    let pool = &state.db;

    // Find or create the Winkd user
    let user = find_or_create_oauth_user(pool, &provider, &userinfo).await?;

    let session_token = db::create_session(pool, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Redirect to login.html which handles the hash and persists the session
    let location = format!(
        "/login.html#oauth=success&session_token={}&winkd_id={}&display_name={}&mood_message={}&avatar_data={}&display_name_color={}&av_color={}",
        urlencoding::encode(&session_token),
        urlencoding::encode(&user.winkd_id),
        urlencoding::encode(&user.display_name),
        urlencoding::encode(&user.mood_message),
        urlencoding::encode(user.avatar_data.as_deref().unwrap_or("")),
        urlencoding::encode(user.display_name_color.as_deref().unwrap_or("")),
        urlencoding::encode(user.av_color.as_deref().unwrap_or("")),
    );

    let clear_cookie = "winkd_oauth_state=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
    let mut response = Redirect::to(&location).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(clear_cookie)
            .map_err(|_| AppError::Internal("Failed to clear oauth cookie".into()))?,
    );

    Ok(response)
}

// ── Find-or-create for OAuth ───────────────────────────────────────────────

async fn find_or_create_oauth_user(
    pool: &db::DbPool,
    provider: &OAuthProvider,
    info: &OAuthUserInfo,
) -> Result<db::User, AppError> {
    // 1. Try to find by existing OAuth link
    if let Some(u) = db::find_user_by_oauth(pool, provider.slug(), &info.provider_user_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        return Ok(u);
    }

    // 2. Try to match on email so the same person doesn't get two accounts
    if let Some(ref email) = info.email {
        if let Some(u) = db::find_user_by_email(pool, email)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        {
            db::link_oauth_account(pool, u.id, provider.slug(), &info.provider_user_id)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            return Ok(u);
        }
    }

    // 3. Create a brand-new user
    let base = info
        .preferred_username
        .as_deref()
        .or(info.display_name.as_deref())
        .map(sanitize_id_part)
        .filter(|s| s.len() >= 3)
        .unwrap_or_else(|| provider.slug().to_string());

    let username = db::unique_username(pool, &base)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let winkd_id = db::unique_winkd_id(pool, &username)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let display_name = info
        .display_name
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(&username)
        .to_string();

    let email = info.email.as_deref();

    let user = db::create_user(pool, &username, &winkd_id, &display_name, email, None)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    db::link_oauth_account(pool, user.id, provider.slug(), &info.provider_user_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    tracing::info!(
        "Created OAuth user: {} ({}) via {}",
        user.display_name,
        user.winkd_id,
        provider.slug()
    );

    Ok(user)
}

// ── OAuth user info ────────────────────────────────────────────────────────

struct OAuthUserInfo {
    provider_user_id: String,
    email: Option<String>,
    display_name: Option<String>,
    preferred_username: Option<String>,
}

impl OAuthProvider {
    async fn fetch_userinfo(
        &self,
        access_token: &str,
        cfg: &OAuthProviderConfig,
    ) -> Result<OAuthUserInfo, AppError> {
        let client = reqwest::Client::new();

        match self {
            Self::Discord => {
                let v = get_json(
                    &client,
                    "https://discord.com/api/users/@me",
                    access_token,
                    None,
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: v["email"].as_str().map(str::to_string),
                    display_name: v["global_name"]
                        .as_str()
                        .or_else(|| v["username"].as_str())
                        .map(str::to_string),
                    preferred_username: v["username"].as_str().map(str::to_string),
                })
            }
            Self::Google => {
                let v = get_json(
                    &client,
                    "https://openidconnect.googleapis.com/v1/userinfo",
                    access_token,
                    None,
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "sub"),
                    email: v["email"].as_str().map(str::to_string),
                    display_name: v["name"].as_str().map(str::to_string),
                    preferred_username: v["given_name"].as_str().map(str::to_string),
                })
            }
            Self::Github => {
                let v = get_json_ua(
                    &client,
                    "https://api.github.com/user",
                    access_token,
                    "Winkd-Messenger/1.0",
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: v["id"]
                        .as_u64()
                        .map(|n| n.to_string())
                        .unwrap_or_default(),
                    email: v["email"].as_str().map(str::to_string),
                    display_name: v["name"]
                        .as_str()
                        .or_else(|| v["login"].as_str())
                        .map(str::to_string),
                    preferred_username: v["login"].as_str().map(str::to_string),
                })
            }
            Self::Microsoft => {
                let v = get_json(
                    &client,
                    "https://graph.microsoft.com/v1.0/me",
                    access_token,
                    None,
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: v["mail"]
                        .as_str()
                        .or_else(|| v["userPrincipalName"].as_str())
                        .map(str::to_string),
                    display_name: v["displayName"].as_str().map(str::to_string),
                    preferred_username: v["givenName"].as_str().map(str::to_string),
                })
            }
            Self::Facebook => {
                let v = get_json(
                    &client,
                    "https://graph.facebook.com/me?fields=id,name,email",
                    access_token,
                    None,
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: v["email"].as_str().map(str::to_string),
                    display_name: v["name"].as_str().map(str::to_string),
                    preferred_username: None,
                })
            }
            Self::Twitter => {
                // Twitter v2 — email requires elevated permissions, so we skip it.
                let v = get_json(
                    &client,
                    "https://api.twitter.com/2/users/me",
                    access_token,
                    None,
                )
                .await?;
                let data = &v["data"];
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(data, "id"),
                    email: None,
                    display_name: data["name"].as_str().map(str::to_string),
                    preferred_username: data["username"].as_str().map(str::to_string),
                })
            }
            Self::Twitch => {
                // Twitch requires both Authorization and Client-Id headers.
                let v = client
                    .get("https://api.twitch.tv/helix/users")
                    .bearer_auth(access_token)
                    .header("Client-Id", &cfg.client_id)
                    .send()
                    .await
                    .map_err(|_| AppError::Internal("Twitch request failed".into()))?
                    .error_for_status()
                    .map_err(|_| AppError::Internal("Twitch returned error".into()))?
                    .json::<serde_json::Value>()
                    .await
                    .map_err(|_| AppError::Internal("Twitch parse failed".into()))?;
                let u = &v["data"][0];
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(u, "id"),
                    email: u["email"].as_str().map(str::to_string),
                    display_name: u["display_name"].as_str().map(str::to_string),
                    preferred_username: u["login"].as_str().map(str::to_string),
                })
            }
            Self::Reddit => {
                let v = get_json_ua(
                    &client,
                    "https://oauth.reddit.com/api/v1/me",
                    access_token,
                    "Winkd-Messenger/1.0",
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: None, // Reddit does not expose email
                    display_name: v["name"].as_str().map(str::to_string),
                    preferred_username: v["name"].as_str().map(str::to_string),
                })
            }
            Self::Spotify => {
                let v = get_json(
                    &client,
                    "https://api.spotify.com/v1/me",
                    access_token,
                    None,
                )
                .await?;
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: v["email"].as_str().map(str::to_string),
                    display_name: v["display_name"].as_str().map(str::to_string),
                    preferred_username: v["id"].as_str().map(str::to_string),
                })
            }
            Self::Linkedin => {
                let v = get_json(
                    &client,
                    "https://api.linkedin.com/v2/me",
                    access_token,
                    None,
                )
                .await?;
                let first = v["localizedFirstName"].as_str().unwrap_or("");
                let last = v["localizedLastName"].as_str().unwrap_or("");
                let display = format!("{first} {last}").trim().to_string();
                Ok(OAuthUserInfo {
                    provider_user_id: str_field(&v, "id"),
                    email: None, // Requires a separate LinkedIn API call
                    display_name: if display.is_empty() {
                        None
                    } else {
                        Some(display)
                    },
                    preferred_username: None,
                })
            }
            Self::Apple | Self::Steam => Err(AppError::Internal(format!(
                "{} OAuth is not yet supported",
                self.slug()
            ))),
        }
    }

    fn scopes(self) -> &'static [&'static str] {
        match self {
            Self::Discord => &["identify", "email"],
            Self::Google => &["openid", "profile", "email"],
            Self::Apple => &["name", "email"],
            Self::Microsoft => &["openid", "profile", "email", "offline_access"],
            Self::Facebook => &["email", "public_profile"],
            Self::Github => &["user:email", "read:user"],
            Self::Twitter => &["tweet.read", "users.read"],
            Self::Twitch => &["openid", "user:read:email"],
            Self::Reddit => &["identity"],
            Self::Steam => &[],
            Self::Spotify => &["user-read-private", "user-read-email"],
            Self::Linkedin => &["openid", "profile", "email"],
        }
    }
}

// ── HTTP helpers for userinfo ──────────────────────────────────────────────

async fn get_json(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    extra_header: Option<(&str, &str)>,
) -> Result<serde_json::Value, AppError> {
    let mut req = client.get(url).bearer_auth(token);
    if let Some((k, v)) = extra_header {
        req = req.header(k, v);
    }
    req.send()
        .await
        .map_err(|_| AppError::Internal(format!("Request to {url} failed")))?
        .error_for_status()
        .map_err(|_| AppError::Internal(format!("{url} returned error status")))?
        .json()
        .await
        .map_err(|_| AppError::Internal(format!("Failed to parse response from {url}")))
}

async fn get_json_ua(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    user_agent: &str,
) -> Result<serde_json::Value, AppError> {
    client
        .get(url)
        .bearer_auth(token)
        .header("User-Agent", user_agent)
        .send()
        .await
        .map_err(|_| AppError::Internal(format!("Request to {url} failed")))?
        .error_for_status()
        .map_err(|_| AppError::Internal(format!("{url} returned error status")))?
        .json()
        .await
        .map_err(|_| AppError::Internal(format!("Failed to parse response from {url}")))
}

fn str_field(v: &serde_json::Value, key: &str) -> String {
    v[key]
        .as_str()
        .map(str::to_string)
        .or_else(|| v[key].as_u64().map(|n| n.to_string()))
        .unwrap_or_default()
}

// ── OAuthProvider enum ─────────────────────────────────────────────────────

#[derive(Clone, Copy)]
enum OAuthProvider {
    Discord,
    Google,
    Apple,
    Microsoft,
    Facebook,
    Github,
    Twitter,
    Twitch,
    Reddit,
    Steam,
    Spotify,
    Linkedin,
}

impl OAuthProvider {
    fn all() -> &'static [Self] {
        &[
            Self::Discord,
            Self::Google,
            Self::Apple,
            Self::Microsoft,
            Self::Facebook,
            Self::Github,
            Self::Twitter,
            Self::Twitch,
            Self::Reddit,
            Self::Steam,
            Self::Spotify,
            Self::Linkedin,
        ]
    }

    fn from_slug(slug: &str) -> Option<Self> {
        match slug {
            "discord" => Some(Self::Discord),
            "google" => Some(Self::Google),
            "apple" => Some(Self::Apple),
            "microsoft" => Some(Self::Microsoft),
            "facebook" => Some(Self::Facebook),
            "github" => Some(Self::Github),
            "twitter" => Some(Self::Twitter),
            "twitch" => Some(Self::Twitch),
            "reddit" => Some(Self::Reddit),
            "steam" => Some(Self::Steam),
            "spotify" => Some(Self::Spotify),
            "linkedin" => Some(Self::Linkedin),
            _ => None,
        }
    }

    fn slug(self) -> &'static str {
        match self {
            Self::Discord => "discord",
            Self::Google => "google",
            Self::Apple => "apple",
            Self::Microsoft => "microsoft",
            Self::Facebook => "facebook",
            Self::Github => "github",
            Self::Twitter => "twitter",
            Self::Twitch => "twitch",
            Self::Reddit => "reddit",
            Self::Steam => "steam",
            Self::Spotify => "spotify",
            Self::Linkedin => "linkedin",
        }
    }

    fn auth_url(self) -> &'static str {
        match self {
            Self::Discord => "https://discord.com/oauth2/authorize",
            Self::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            Self::Apple => "https://appleid.apple.com/auth/authorize",
            Self::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
            }
            Self::Facebook => "https://www.facebook.com/v18.0/dialog/oauth",
            Self::Github => "https://github.com/login/oauth/authorize",
            Self::Twitter => "https://twitter.com/i/oauth2/authorize",
            Self::Twitch => "https://id.twitch.tv/oauth2/authorize",
            Self::Reddit => "https://www.reddit.com/api/v1/authorize",
            Self::Steam => "https://steamcommunity.com/openid/login",
            Self::Spotify => "https://accounts.spotify.com/authorize",
            Self::Linkedin => "https://www.linkedin.com/oauth/v2/authorization",
        }
    }

    fn token_url(self) -> &'static str {
        match self {
            Self::Discord => "https://discord.com/api/oauth2/token",
            Self::Google => "https://oauth2.googleapis.com/token",
            Self::Apple => "https://appleid.apple.com/auth/token",
            Self::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/token"
            }
            Self::Facebook => "https://graph.facebook.com/v18.0/oauth/access_token",
            Self::Github => "https://github.com/login/oauth/access_token",
            Self::Twitter => "https://api.twitter.com/2/oauth2/token",
            Self::Twitch => "https://id.twitch.tv/oauth2/token",
            Self::Reddit => "https://www.reddit.com/api/v1/access_token",
            Self::Steam => {
                "https://api.steampowered.com/ISteamUserOAuth/GetTokenDetails/v1/"
            }
            Self::Spotify => "https://accounts.spotify.com/api/token",
            Self::Linkedin => "https://www.linkedin.com/oauth/v2/accessToken",
        }
    }

    fn load_env(self) -> Result<OAuthProviderConfig, AppError> {
        let upper = self.slug().to_ascii_uppercase();
        let client_id = env_var_first(&[
            &format!("WINKD_OAUTH_{}_CLIENT_ID", upper),
            &format!("OAUTH_{}_CLIENT_ID", upper),
        ])
        .ok_or_else(|| {
            AppError::Internal(format!("OAuth provider {} is not configured", self.slug()))
        })?;
        let client_secret = env_var_first(&[
            &format!("WINKD_OAUTH_{}_CLIENT_SECRET", upper),
            &format!("OAUTH_{}_CLIENT_SECRET", upper),
        ])
        .ok_or_else(|| {
            AppError::Internal(format!("OAuth provider {} is not configured", self.slug()))
        })?;
        let redirect_url = env_var_first(&[
            &format!("WINKD_OAUTH_{}_REDIRECT_URL", upper),
            &format!("OAUTH_{}_REDIRECT_URL", upper),
        ])
        .unwrap_or_else(|| {
            format!(
                "http://localhost:8080/api/auth/oauth/{}/callback",
                self.slug()
            )
        });

        Ok(OAuthProviderConfig {
            client_id,
            client_secret,
            redirect_url,
        })
    }

    fn is_configured(self) -> bool {
        let upper = self.slug().to_ascii_uppercase();
        env_var_first(&[
            &format!("WINKD_OAUTH_{}_CLIENT_ID", upper),
            &format!("OAUTH_{}_CLIENT_ID", upper),
        ])
        .is_some()
            && env_var_first(&[
                &format!("WINKD_OAUTH_{}_CLIENT_SECRET", upper),
                &format!("OAUTH_{}_CLIENT_SECRET", upper),
            ])
            .is_some()
    }

    fn client(self, cfg: &OAuthProviderConfig) -> Result<BasicClient, AppError> {
        let auth_url = AuthUrl::new(self.auth_url().to_string())
            .map_err(|_| AppError::Internal("Invalid auth URL".into()))?;
        let token_url = TokenUrl::new(self.token_url().to_string())
            .map_err(|_| AppError::Internal("Invalid token URL".into()))?;
        let redirect_url = RedirectUrl::new(cfg.redirect_url.clone())
            .map_err(|_| AppError::Internal("Invalid redirect URL".into()))?;

        Ok(BasicClient::new(
            ClientId::new(cfg.client_id.clone()),
            Some(ClientSecret::new(cfg.client_secret.clone())),
            auth_url,
            Some(token_url),
        )
        .set_redirect_uri(redirect_url))
    }
}

struct OAuthProviderConfig {
    client_id: String,
    client_secret: String,
    redirect_url: String,
}

// ── Utilities ──────────────────────────────────────────────────────────────

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn parse_cookie(headers: &HeaderMap, key: &str) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    let mut values = HashMap::new();
    for chunk in cookie_header.split(';') {
        let mut parts = chunk.trim().splitn(2, '=');
        let name = parts.next()?.trim();
        let value = parts.next().unwrap_or("").trim();
        values.insert(name.to_string(), value.to_string());
    }
    values.get(key).cloned()
}

pub fn sanitize_id_part(input: &str) -> String {
    let filtered: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(24)
        .collect::<String>()
        .to_lowercase();

    if filtered.len() < 3 {
        "winkd".to_string()
    } else {
        filtered
    }
}

fn env_var_first(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| env::var(key).ok())
}

// ── Argon2 factory ─────────────────────────────────────────────────────────
// 128 MB memory (m=131072), 4 iterations (t=4), 4 parallel lanes (p=4).
// Substantially stronger than the library defaults (64 MB / 3 iterations).

fn make_argon2() -> Result<Argon2<'static>, argon2::password_hash::Error> {
    let params = Params::new(131_072, 4, 4, None)
        .map_err(|_| argon2::password_hash::Error::Algorithm)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

// ── Password policy ────────────────────────────────────────────────────────
// Minimum 12 characters, must include uppercase, lowercase, and a digit.
// This keeps the check fast and dependency-free while enforcing meaningful entropy.

fn validate_password(password: &str) -> Result<(), AppError> {
    if password.len() < 12 {
        return Err(AppError::Internal(
            "Password must be at least 12 characters".into(),
        ));
    }
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    if !has_upper || !has_lower || !has_digit {
        return Err(AppError::Internal(
            "Password must contain at least one uppercase letter, one lowercase letter, and one digit".into(),
        ));
    }
    Ok(())
}

// ── Auth helper ────────────────────────────────────────────────────────────

/// Extract and validate the Bearer session token from the Authorization header.
/// Returns the authenticated User or 401.
pub async fn require_auth(
    headers: &HeaderMap,
    pool: &db::DbPool,
) -> Result<db::User, AppError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    db::find_user_by_session(pool, token)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::Unauthorized)
}

// ── Recovery code helpers ──────────────────────────────────────────────────

const RECOVERY_CODE_COUNT: usize = 10;
const RECOVERY_CODE_LEN: usize = 32; // chars (128-bit random, alphanumeric)

/// Generate N cryptographically random alphanumeric recovery codes.
/// Returns (plaintext_codes, sha256_hashes) — store only the hashes.
fn generate_recovery_codes() -> (Vec<String>, Vec<String>) {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    let mut plaintext = Vec::with_capacity(RECOVERY_CODE_COUNT);
    let mut hashes = Vec::with_capacity(RECOVERY_CODE_COUNT);

    for _ in 0..RECOVERY_CODE_COUNT {
        let code: String = (0..RECOVERY_CODE_LEN)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();
        let hash = hex::encode(Sha256::digest(code.as_bytes()));
        plaintext.push(code);
        hashes.push(hash);
    }

    (plaintext, hashes)
}

fn sha256_hex(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

// ── TOTP: challenge verification (2FA login step) ──────────────────────────

#[derive(Deserialize)]
pub struct TotpChallengeRequest {
    pub challenge_token: String,
    /// Either a 6-digit TOTP code or a 32-char backup code.
    pub code: String,
}

pub async fn totp_challenge(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<TotpChallengeRequest>,
) -> Result<Response, AppError> {
    let ip = extract_ip(&headers).to_string();
    let pool = &state.db;

    // Validate and consume the challenge token.
    let user_id = db::consume_totp_challenge(pool, &body.challenge_token)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::Unauthorized)?;

    let user = db::find_user_by_id(pool, user_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::Unauthorized)?;

    let secret = user
        .totp_secret
        .as_deref()
        .ok_or(AppError::Unauthorized)?;

    // Try TOTP code first, then backup code.
    let code_clean = body.code.trim();
    let verified = if code_clean.len() == 6 && code_clean.chars().all(|c| c.is_ascii_digit()) {
        totp::verify(secret, code_clean)
    } else {
        // Treat as a backup code: hash it and look it up in the DB.
        let hash = sha256_hex(code_clean);
        let consumed = db::consume_recovery_code(pool, user_id, &hash)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        if consumed {
            audit::log(pool, Some(user_id), audit::Action::RecoveryCodeUsed, Some(&ip),
                serde_json::json!({ "remaining": db::count_recovery_codes(pool, user_id).await.unwrap_or(0) })).await;
        }
        consumed
    };

    if !verified {
        audit::log(pool, Some(user_id), audit::Action::TotpChallengeFailed, Some(&ip),
            serde_json::json!({})).await;
        return Err(AppError::Unauthorized);
    }

    // Create the real session.
    let session_token = db::create_session(pool, user_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user_id), audit::Action::TotpChallengePassed, Some(&ip),
        serde_json::json!({})).await;

    Ok(Json(LoginResponse {
        session_token,
        winkd_id: user.winkd_id,
        display_name: user.display_name,
        mood_message: user.mood_message,
        avatar_data: user.avatar_data,
        display_name_color: user.display_name_color,
        av_color: user.av_color,
    })
    .into_response())
}

// ── TOTP: setup (generate secret, return QR URI) ───────────────────────────

#[derive(Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub uri: String,
}

pub async fn totp_setup(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<TotpSetupResponse>, AppError> {
    let user = require_auth(&headers, &state.db).await?;
    let secret = totp::generate_secret();
    let uri = totp::totp_uri(&secret, &user.winkd_id, "Winkd");

    // Store the pending secret (not yet enabled — enabled only after /confirm).
    db::set_totp_secret(&state.db, user.id, &secret)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(TotpSetupResponse { secret, uri }))
}

// ── TOTP: confirm (verify first code, enable 2FA, return backup codes) ─────

#[derive(Deserialize)]
pub struct TotpConfirmRequest {
    pub code: String,
}

#[derive(Serialize)]
pub struct TotpConfirmResponse {
    pub backup_codes: Vec<String>,
}

pub async fn totp_confirm(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<TotpConfirmRequest>,
) -> Result<Json<TotpConfirmResponse>, AppError> {
    let ip = extract_ip(&headers).to_string();
    let user = require_auth(&headers, &state.db).await?;
    let pool = &state.db;

    let secret = user
        .totp_secret
        .as_deref()
        .ok_or_else(|| AppError::Internal("No pending TOTP secret — call /setup first".into()))?;

    if !totp::verify(secret, body.code.trim()) {
        return Err(AppError::Unauthorized);
    }

    // Enable 2FA and generate backup codes atomically.
    db::set_totp_enabled(pool, user.id, true)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let (plaintext, hashes) = generate_recovery_codes();
    db::store_recovery_codes(pool, user.id, &hashes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user.id), audit::Action::TotpEnabled, Some(&ip),
        serde_json::json!({})).await;

    Ok(Json(TotpConfirmResponse { backup_codes: plaintext }))
}

// ── TOTP: disable ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TotpDisableRequest {
    pub code: String,
}

pub async fn totp_disable(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<TotpDisableRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ip = extract_ip(&headers).to_string();
    let user = require_auth(&headers, &state.db).await?;
    let pool = &state.db;

    if !user.totp_enabled {
        return Err(AppError::Internal("2FA is not currently enabled".into()));
    }

    let secret = user.totp_secret.as_deref().ok_or(AppError::Unauthorized)?;
    if !totp::verify(secret, body.code.trim()) {
        return Err(AppError::Unauthorized);
    }

    db::set_totp_enabled(pool, user.id, false)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user.id), audit::Action::TotpDisabled, Some(&ip),
        serde_json::json!({})).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Recovery codes: regenerate ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegenerateCodesRequest {
    /// Requires a valid TOTP code to confirm intent before wiping old codes.
    pub code: String,
}

#[derive(Serialize)]
pub struct RegenerateCodesResponse {
    pub backup_codes: Vec<String>,
    pub remaining_before: i64,
}

pub async fn recovery_codes_generate(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<RegenerateCodesRequest>,
) -> Result<Json<RegenerateCodesResponse>, AppError> {
    let ip = extract_ip(&headers).to_string();
    let user = require_auth(&headers, &state.db).await?;
    let pool = &state.db;

    if !user.totp_enabled {
        return Err(AppError::Internal(
            "2FA must be enabled to manage recovery codes".into(),
        ));
    }

    let secret = user.totp_secret.as_deref().ok_or(AppError::Unauthorized)?;
    if !totp::verify(secret, body.code.trim()) {
        return Err(AppError::Unauthorized);
    }

    let remaining_before = db::count_recovery_codes(pool, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let (plaintext, hashes) = generate_recovery_codes();
    db::store_recovery_codes(pool, user.id, &hashes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user.id), audit::Action::RecoveryCodesRegenerated, Some(&ip),
        serde_json::json!({ "previous_remaining": remaining_before })).await;

    Ok(Json(RegenerateCodesResponse { backup_codes: plaintext, remaining_before }))
}

// ── Recovery codes: status ─────────────────────────────────────────────────

pub async fn recovery_codes_status(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = require_auth(&headers, &state.db).await?;
    let remaining = db::count_recovery_codes(&state.db, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "totp_enabled": user.totp_enabled,
        "recovery_codes_remaining": remaining,
    })))
}

// ── Devices: list ──────────────────────────────────────────────────────────

pub async fn list_devices(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = require_auth(&headers, &state.db).await?;
    let devices = db::list_devices(&state.db, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "devices": devices })))
}

// ── Devices: revoke ────────────────────────────────────────────────────────

pub async fn revoke_device(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(device_id): Path<i32>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ip = extract_ip(&headers).to_string();
    let user = require_auth(&headers, &state.db).await?;
    let pool = &state.db;

    let removed = db::revoke_device(pool, user.id, device_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if !removed {
        return Err(AppError::NotFound("Device not found".into()));
    }

    audit::log(pool, Some(user.id), audit::Action::DeviceRevoked, Some(&ip),
        serde_json::json!({ "device_id": device_id })).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Devices: register / upload pre-key bundle ──────────────────────────────

#[derive(Deserialize)]
pub struct PreKeyBundleUpload {
    pub device_id: i32,
    pub device_name: String,
    pub registration_id: i32,
    pub identity_key: String,
    pub spk_id: i32,
    pub spk_public_key: String,
    pub spk_signature: String,
    pub one_time_pre_keys: Vec<OneTimePreKey>,
}

#[derive(Deserialize)]
pub struct OneTimePreKey {
    pub key_id: i32,
    pub public_key: String,
}

pub async fn upload_pre_key_bundle(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(body): Json<PreKeyBundleUpload>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ip = extract_ip(&headers).to_string();
    let user = require_auth(&headers, &state.db).await?;
    let pool = &state.db;

    // Upsert the signed pre-key bundle.
    sqlx::query(
        r#"INSERT INTO pre_key_bundles
               (user_id, device_id, registration_id, identity_key,
                spk_id, spk_public_key, spk_signature, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (user_id, device_id)
           DO UPDATE SET registration_id = EXCLUDED.registration_id,
                         identity_key    = EXCLUDED.identity_key,
                         spk_id          = EXCLUDED.spk_id,
                         spk_public_key  = EXCLUDED.spk_public_key,
                         spk_signature   = EXCLUDED.spk_signature,
                         uploaded_at     = NOW()"#,
    )
    .bind(user.id)
    .bind(body.device_id)
    .bind(body.registration_id)
    .bind(&body.identity_key)
    .bind(body.spk_id)
    .bind(&body.spk_public_key)
    .bind(&body.spk_signature)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    // Store any uploaded one-time pre-keys (ignore duplicates).
    for otpk in &body.one_time_pre_keys {
        let _ = sqlx::query(
            r#"INSERT INTO one_time_pre_keys (user_id, key_id, public_key)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id, key_id) DO NOTHING"#,
        )
        .bind(user.id)
        .bind(otpk.key_id)
        .bind(&otpk.public_key)
        .execute(pool)
        .await;
    }

    // Register the device (upsert).
    db::register_device(pool, user.id, body.device_id, &body.device_name)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    audit::log(pool, Some(user.id), audit::Action::DeviceRegistered, Some(&ip),
        serde_json::json!({
            "device_id": body.device_id,
            "device_name": body.device_name,
        })).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Pre-key bundle: fetch (for X3DH initiation) ────────────────────────────

pub async fn fetch_pre_key_bundle(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(winkd_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_auth(&headers, &state.db).await?; // Must be authenticated to fetch

    let pool = &state.db;
    let target = db::find_user_by_winkd_id(pool, &winkd_id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    // Fetch the primary device bundle.
    let bundle: Option<(i32, i32, String, i32, String, String)> = sqlx::query_as(
        r#"SELECT registration_id, device_id, identity_key,
                  spk_id, spk_public_key, spk_signature
           FROM   pre_key_bundles
           WHERE  user_id = $1
           ORDER  BY device_id ASC
           LIMIT  1"#,
    )
    .bind(target.id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let (registration_id, device_id, identity_key, spk_id, spk_public_key, spk_signature) =
        bundle.ok_or_else(|| AppError::NotFound("No pre-key bundle for this user".into()))?;

    // Atomically consume one one-time pre-key if available.
    let otpk: Option<(i32, String)> = sqlx::query_as(
        r#"DELETE FROM one_time_pre_keys
           WHERE id = (
               SELECT id FROM one_time_pre_keys
               WHERE user_id = $1
               ORDER BY key_id ASC
               LIMIT 1
           )
           RETURNING key_id, public_key"#,
    )
    .bind(target.id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "registration_id": registration_id,
        "device_id": device_id,
        "identity_key": identity_key,
        "spk_id": spk_id,
        "spk_public_key": spk_public_key,
        "spk_signature": spk_signature,
        "one_time_pre_key": otpk.map(|(id, key)| serde_json::json!({
            "key_id": id,
            "public_key": key,
        })),
    })))
}

// ── Audit log: fetch ───────────────────────────────────────────────────────

pub async fn get_audit_log(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = require_auth(&headers, &state.db).await?;
    let entries = db::get_audit_log(&state.db, user.id, 100)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "events": entries })))
}
