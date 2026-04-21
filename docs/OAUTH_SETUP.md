# OAuth Provider Setup (Login Page)

This is the exact setup flow for **all OAuth providers shown on Winkd's login page**, in the order starting with **Discord**.

## 0) How Winkd enables providers

A provider is considered configured only when both of these env vars exist:

- `WINKD_OAUTH_<PROVIDER>_CLIENT_ID` (or fallback `OAUTH_<PROVIDER>_CLIENT_ID`)
- `WINKD_OAUTH_<PROVIDER>_CLIENT_SECRET` (or fallback `OAUTH_<PROVIDER>_CLIENT_SECRET`)

Optional redirect override:

- `WINKD_OAUTH_<PROVIDER>_REDIRECT_URL` (or fallback `OAUTH_<PROVIDER>_REDIRECT_URL`)

If no redirect env var is provided, Winkd defaults to:

- `http://localhost:8080/api/auth/oauth/<provider>/callback`

> Replace `<PROVIDER>` with uppercase slug, e.g. `DISCORD`, `GOOGLE`, `GITHUB`.

---

## 1) Discord (first)

### Create app in Discord Developer Portal

1. Create a new application.
2. Add an OAuth2 redirect URL:
   - Local: `http://localhost:8080/api/auth/oauth/discord/callback`
   - Prod: `https://<your-domain>/api/auth/oauth/discord/callback`
3. Copy **Client ID** and **Client Secret**.
4. Ensure OAuth scopes include:
   - `identify`
   - `email`

### Set Winkd env vars

```bash
WINKD_OAUTH_DISCORD_CLIENT_ID=...
WINKD_OAUTH_DISCORD_CLIENT_SECRET=...
WINKD_OAUTH_DISCORD_REDIRECT_URL=http://localhost:8080/api/auth/oauth/discord/callback
```

---

## 2) Google

### Google Cloud Console

1. Create OAuth client credentials (Web application).
2. Authorized redirect URI:
   - `http://localhost:8080/api/auth/oauth/google/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `openid`
   - `profile`
   - `email`

### Env vars

```bash
WINKD_OAUTH_GOOGLE_CLIENT_ID=...
WINKD_OAUTH_GOOGLE_CLIENT_SECRET=...
WINKD_OAUTH_GOOGLE_REDIRECT_URL=http://localhost:8080/api/auth/oauth/google/callback
```

---

## 3) Apple

> Current status in Winkd server code: listed in the login UI, but callback handling returns **"apple OAuth is not yet supported"**.

You can add credentials, but sign-in will not complete until Apple userinfo handling is implemented.

### Env vars (pre-config only)

```bash
WINKD_OAUTH_APPLE_CLIENT_ID=...
WINKD_OAUTH_APPLE_CLIENT_SECRET=...
WINKD_OAUTH_APPLE_REDIRECT_URL=http://localhost:8080/api/auth/oauth/apple/callback
```

---

## 4) Microsoft

### Microsoft Entra / Azure app registration

1. Register an app.
2. Add redirect URI:
   - `http://localhost:8080/api/auth/oauth/microsoft/callback`
3. Create client secret.
4. Required scopes in Winkd:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`

### Env vars

```bash
WINKD_OAUTH_MICROSOFT_CLIENT_ID=...
WINKD_OAUTH_MICROSOFT_CLIENT_SECRET=...
WINKD_OAUTH_MICROSOFT_REDIRECT_URL=http://localhost:8080/api/auth/oauth/microsoft/callback
```

---

## 5) Facebook

### Meta for Developers

1. Create app and enable Facebook Login.
2. Valid OAuth redirect URI:
   - `http://localhost:8080/api/auth/oauth/facebook/callback`
3. Copy App ID/App Secret into Winkd vars.
4. Required scopes in Winkd:
   - `email`
   - `public_profile`

### Env vars

```bash
WINKD_OAUTH_FACEBOOK_CLIENT_ID=...
WINKD_OAUTH_FACEBOOK_CLIENT_SECRET=...
WINKD_OAUTH_FACEBOOK_REDIRECT_URL=http://localhost:8080/api/auth/oauth/facebook/callback
```

---

## 6) GitHub

### GitHub OAuth App

1. Create OAuth App.
2. Authorization callback URL:
   - `http://localhost:8080/api/auth/oauth/github/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `user:email`
   - `read:user`

### Env vars

```bash
WINKD_OAUTH_GITHUB_CLIENT_ID=...
WINKD_OAUTH_GITHUB_CLIENT_SECRET=...
WINKD_OAUTH_GITHUB_REDIRECT_URL=http://localhost:8080/api/auth/oauth/github/callback
```

---

## 7) X / Twitter

### X developer app

1. Create OAuth 2.0 app.
2. Callback URL:
   - `http://localhost:8080/api/auth/oauth/twitter/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `tweet.read`
   - `users.read`

### Env vars

```bash
WINKD_OAUTH_TWITTER_CLIENT_ID=...
WINKD_OAUTH_TWITTER_CLIENT_SECRET=...
WINKD_OAUTH_TWITTER_REDIRECT_URL=http://localhost:8080/api/auth/oauth/twitter/callback
```

---

## 8) Twitch

### Twitch developer console

1. Register an application.
2. OAuth redirect URL:
   - `http://localhost:8080/api/auth/oauth/twitch/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `openid`
   - `user:read:email`

### Env vars

```bash
WINKD_OAUTH_TWITCH_CLIENT_ID=...
WINKD_OAUTH_TWITCH_CLIENT_SECRET=...
WINKD_OAUTH_TWITCH_REDIRECT_URL=http://localhost:8080/api/auth/oauth/twitch/callback
```

---

## 9) Reddit

### Reddit app

1. Create app (web app).
2. Redirect URI:
   - `http://localhost:8080/api/auth/oauth/reddit/callback`
3. Copy client ID/secret.
4. Required scope in Winkd:
   - `identity`

### Env vars

```bash
WINKD_OAUTH_REDDIT_CLIENT_ID=...
WINKD_OAUTH_REDDIT_CLIENT_SECRET=...
WINKD_OAUTH_REDDIT_REDIRECT_URL=http://localhost:8080/api/auth/oauth/reddit/callback
```

---

## 10) Steam

> Current status in Winkd server code: listed in the login UI, but callback handling returns **"steam OAuth is not yet supported"**.

You can pre-seed env vars, but sign-in will not complete until Steam userinfo handling is implemented.

### Env vars (pre-config only)

```bash
WINKD_OAUTH_STEAM_CLIENT_ID=...
WINKD_OAUTH_STEAM_CLIENT_SECRET=...
WINKD_OAUTH_STEAM_REDIRECT_URL=http://localhost:8080/api/auth/oauth/steam/callback
```

---

## 11) Spotify

### Spotify developer dashboard

1. Create app.
2. Redirect URI:
   - `http://localhost:8080/api/auth/oauth/spotify/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `user-read-private`
   - `user-read-email`

### Env vars

```bash
WINKD_OAUTH_SPOTIFY_CLIENT_ID=...
WINKD_OAUTH_SPOTIFY_CLIENT_SECRET=...
WINKD_OAUTH_SPOTIFY_REDIRECT_URL=http://localhost:8080/api/auth/oauth/spotify/callback
```

---

## 12) LinkedIn

### LinkedIn developer app

1. Create app + OAuth 2.0 credentials.
2. Redirect URL:
   - `http://localhost:8080/api/auth/oauth/linkedin/callback`
3. Copy client ID/secret.
4. Required scopes in Winkd:
   - `openid`
   - `profile`
   - `email`

### Env vars

```bash
WINKD_OAUTH_LINKEDIN_CLIENT_ID=...
WINKD_OAUTH_LINKEDIN_CLIENT_SECRET=...
WINKD_OAUTH_LINKEDIN_REDIRECT_URL=http://localhost:8080/api/auth/oauth/linkedin/callback
```

---

## 13) Quick local smoke test

After setting one or more providers:

1. Restart the Rust server.
2. Load providers endpoint:
   - `GET /api/auth/oauth/providers`
3. Confirm your provider slug is returned.
4. Open `login.html` and verify its button is no longer disabled.
5. Click provider button and confirm redirect to provider auth page.
6. Complete auth and verify redirect back to:
   - `/login.html#oauth=success&session_token=...`

---

## 14) Minimal `.env` template

```bash
# Discord
WINKD_OAUTH_DISCORD_CLIENT_ID=
WINKD_OAUTH_DISCORD_CLIENT_SECRET=
WINKD_OAUTH_DISCORD_REDIRECT_URL=http://localhost:8080/api/auth/oauth/discord/callback

# Google
WINKD_OAUTH_GOOGLE_CLIENT_ID=
WINKD_OAUTH_GOOGLE_CLIENT_SECRET=
WINKD_OAUTH_GOOGLE_REDIRECT_URL=http://localhost:8080/api/auth/oauth/google/callback

# GitHub
WINKD_OAUTH_GITHUB_CLIENT_ID=
WINKD_OAUTH_GITHUB_CLIENT_SECRET=
WINKD_OAUTH_GITHUB_REDIRECT_URL=http://localhost:8080/api/auth/oauth/github/callback

# Microsoft
WINKD_OAUTH_MICROSOFT_CLIENT_ID=
WINKD_OAUTH_MICROSOFT_CLIENT_SECRET=
WINKD_OAUTH_MICROSOFT_REDIRECT_URL=http://localhost:8080/api/auth/oauth/microsoft/callback

# Facebook
WINKD_OAUTH_FACEBOOK_CLIENT_ID=
WINKD_OAUTH_FACEBOOK_CLIENT_SECRET=
WINKD_OAUTH_FACEBOOK_REDIRECT_URL=http://localhost:8080/api/auth/oauth/facebook/callback

# X / Twitter
WINKD_OAUTH_TWITTER_CLIENT_ID=
WINKD_OAUTH_TWITTER_CLIENT_SECRET=
WINKD_OAUTH_TWITTER_REDIRECT_URL=http://localhost:8080/api/auth/oauth/twitter/callback

# Twitch
WINKD_OAUTH_TWITCH_CLIENT_ID=
WINKD_OAUTH_TWITCH_CLIENT_SECRET=
WINKD_OAUTH_TWITCH_REDIRECT_URL=http://localhost:8080/api/auth/oauth/twitch/callback

# Reddit
WINKD_OAUTH_REDDIT_CLIENT_ID=
WINKD_OAUTH_REDDIT_CLIENT_SECRET=
WINKD_OAUTH_REDDIT_REDIRECT_URL=http://localhost:8080/api/auth/oauth/reddit/callback

# Spotify
WINKD_OAUTH_SPOTIFY_CLIENT_ID=
WINKD_OAUTH_SPOTIFY_CLIENT_SECRET=
WINKD_OAUTH_SPOTIFY_REDIRECT_URL=http://localhost:8080/api/auth/oauth/spotify/callback

# LinkedIn
WINKD_OAUTH_LINKEDIN_CLIENT_ID=
WINKD_OAUTH_LINKEDIN_CLIENT_SECRET=
WINKD_OAUTH_LINKEDIN_REDIRECT_URL=http://localhost:8080/api/auth/oauth/linkedin/callback

# Listed in UI but not fully implemented in backend callback:
WINKD_OAUTH_APPLE_CLIENT_ID=
WINKD_OAUTH_APPLE_CLIENT_SECRET=
WINKD_OAUTH_APPLE_REDIRECT_URL=http://localhost:8080/api/auth/oauth/apple/callback
WINKD_OAUTH_STEAM_CLIENT_ID=
WINKD_OAUTH_STEAM_CLIENT_SECRET=
WINKD_OAUTH_STEAM_REDIRECT_URL=http://localhost:8080/api/auth/oauth/steam/callback
```
