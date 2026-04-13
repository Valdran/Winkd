-- Winkd Messenger: initial schema
-- Runs automatically on server startup via sqlx::migrate!

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(32)  NOT NULL UNIQUE,
    winkd_id      VARCHAR(40)  NOT NULL UNIQUE,
    display_name  VARCHAR(64)  NOT NULL,
    email         VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),          -- NULL for OAuth-only users
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email) WHERE email IS NOT NULL;

-- ── OAuth accounts ─────────────────────────────────────────────────────────
-- Links a provider (discord, google, github …) + their user ID to a Winkd user.
-- One user can have multiple OAuth accounts; one (provider, provider_user_id)
-- can only map to a single Winkd user.
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(32)  NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
    ON oauth_accounts(user_id);

-- ── Sessions ───────────────────────────────────────────────────────────────
-- Opaque bearer tokens; expire after 30 days.
-- Redis may be added in Phase 1 for real-time invalidation; this table is
-- the authoritative store.
CREATE TABLE IF NOT EXISTS sessions (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_sessions_token
    ON sessions(token);
