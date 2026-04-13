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
    Argon2,
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

use crate::{db, error::AppError, router::AppState};

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
}

#[derive(Serialize)]
pub struct OAuthProvidersResponse {
    pub providers: Vec<&'static str>,
}

// ── Login ──────────────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
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

    let user = user.ok_or(AppError::Unauthorized)?;

    // OAuth-only accounts have no password hash — reject password login attempts.
    let hash = user.password_hash.as_deref().ok_or(AppError::Unauthorized)?;
    let parsed = PasswordHash::new(hash).map_err(|_| AppError::Unauthorized)?;
    Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)?;

    let token = db::create_session(pool, user.id)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id: user.winkd_id,
        display_name: user.display_name,
    }))
}

// ── Register ───────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let username = sanitize_id_part(body.username.trim());

    if username.len() < 3 {
        return Err(AppError::Internal(
            "Username must be at least 3 characters".into(),
        ));
    }
    if body.password.len() < 10 {
        return Err(AppError::Internal(
            "Password must be at least 10 characters".into(),
        ));
    }

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

    // Hash password with Argon2
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
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

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id: user.winkd_id,
        display_name: user.display_name,
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
        "winkd_oauth_state={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600",
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
        "/login.html#oauth=success&session_token={}&winkd_id={}&display_name={}",
        urlencoding::encode(&session_token),
        urlencoding::encode(&user.winkd_id),
        urlencoding::encode(&user.display_name),
    );

    let clear_cookie = "winkd_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
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
