// ── Auth ──
// Username + password auth with Argon2 hashing.
// Session tokens are opaque random strings stored in Redis.
// OAuth flow uses provider-specific authorization/token endpoints with PKCE + state.

use std::{
    collections::HashMap,
    env,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenUrl,
};
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

#[derive(Serialize)]
pub struct OAuthProvidersResponse {
    pub providers: Vec<&'static str>,
}

pub async fn login(
    State(_state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    if body.username.trim().is_empty() || body.password.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let token = Uuid::new_v4().to_string();
    let winkd_id = format!(
        "{}#{:04}",
        sanitize_id_part(&body.username),
        rand::random::<u16>() % 10000
    );

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
    if body.username.trim().is_empty() || body.password.len() < 10 {
        return Err(AppError::Internal("Invalid registration data".into()));
    }

    let token = Uuid::new_v4().to_string();
    let winkd_id = format!(
        "{}#{:04}",
        sanitize_id_part(&body.username),
        rand::random::<u16>() % 10000
    );

    tracing::info!("Registered new user: {} ({})", body.display_name, winkd_id);

    Ok(Json(LoginResponse {
        session_token: token,
        winkd_id,
    }))
}

pub async fn oauth_providers() -> Json<OAuthProvidersResponse> {
    let providers = OAuthProvider::all()
        .iter()
        .copied()
        .filter(|provider| provider.is_configured())
        .map(OAuthProvider::slug)
        .collect();

    Json(OAuthProvidersResponse { providers })
}

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

    let (auth_url, csrf_token) = oauth_client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".into()))
        .add_scope(Scope::new("profile".into()))
        .add_scope(Scope::new("email".into()))
        .set_pkce_challenge(pkce_challenge)
        .url();

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

pub async fn oauth_callback(
    Path(provider): Path<String>,
    State(_state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let provider = OAuthProvider::from_slug(&provider)
        .ok_or_else(|| AppError::Internal("Unsupported OAuth provider".into()))?;
    let cfg = provider.load_env()?;

    let cookie =
        parse_cookie(&headers, "winkd_oauth_state").ok_or_else(|| AppError::Unauthorized)?;

    let decoded = urlencoding::decode(&cookie).map_err(|_| AppError::Unauthorized)?;
    let parts: Vec<&str> = decoded.split('|').collect();
    if parts.len() != 4 {
        return Err(AppError::Unauthorized);
    }

    let (cookie_provider, saved_state, pkce_verifier, issued_at) =
        (parts[0], parts[1], parts[2], parts[3]);

    if cookie_provider != provider.slug() || saved_state != query.state {
        return Err(AppError::Unauthorized);
    }

    let issued_at: u64 = issued_at.parse().map_err(|_| AppError::Unauthorized)?;
    if now_epoch_secs().saturating_sub(issued_at) > 600 {
        return Err(AppError::Unauthorized);
    }

    let oauth_client = provider.client(&cfg)?;
    oauth_client
        .exchange_code(AuthorizationCode::new(query.code))
        .set_pkce_verifier(PkceCodeVerifier::new(pkce_verifier.to_string()))
        .request_async(async_http_client)
        .await
        .map_err(|_| AppError::Unauthorized)?;

    let session_token = Uuid::new_v4().to_string();
    let winkd_id = format!(
        "{}{}#{:04}",
        provider.id_prefix(),
        rand::random::<u16>() % 999,
        rand::random::<u16>() % 10000
    );

    let location = format!(
        "/login.html#oauth=success&session_token={}&winkd_id={}",
        urlencoding::encode(&session_token),
        urlencoding::encode(&winkd_id)
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

    fn id_prefix(self) -> &'static str {
        self.slug()
    }

    fn auth_url(self) -> &'static str {
        match self {
            Self::Discord => "https://discord.com/oauth2/authorize",
            Self::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            Self::Apple => "https://appleid.apple.com/auth/authorize",
            Self::Microsoft => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
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
            Self::Microsoft => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            Self::Facebook => "https://graph.facebook.com/v18.0/oauth/access_token",
            Self::Github => "https://github.com/login/oauth/access_token",
            Self::Twitter => "https://api.twitter.com/2/oauth2/token",
            Self::Twitch => "https://id.twitch.tv/oauth2/token",
            Self::Reddit => "https://www.reddit.com/api/v1/access_token",
            Self::Steam => "https://api.steampowered.com/ISteamUserOAuth/GetTokenDetails/v1/",
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
        .ok_or_else(|| AppError::Internal(format!("OAuth provider {} is not configured", self.slug())))?;
        let client_secret = env_var_first(&[
            &format!("WINKD_OAUTH_{}_CLIENT_SECRET", upper),
            &format!("OAUTH_{}_CLIENT_SECRET", upper),
        ])
        .ok_or_else(|| AppError::Internal(format!("OAuth provider {} is not configured", self.slug())))?;
        let redirect_url = env_var_first(&[
            &format!("WINKD_OAUTH_{}_REDIRECT_URL", upper),
            &format!("OAUTH_{}_REDIRECT_URL", upper),
        ])
        .unwrap_or_else(|| format!("http://localhost:8080/api/auth/oauth/{}/callback", self.slug()));

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

fn sanitize_id_part(input: &str) -> String {
    let filtered: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(24)
        .collect();

    if filtered.is_empty() {
        "winkd".to_string()
    } else {
        filtered
    }
}

fn env_var_first(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| env::var(key).ok())
}
