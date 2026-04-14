-- ── 2FA (TOTP) and Account Recovery ───────────────────────────────────────
-- Adds TOTP two-factor authentication and single-use backup (recovery) codes.

-- TOTP state columns on users.
-- totp_secret is NULL until the user completes setup (confirm step).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS totp_secret  TEXT;

-- Short-lived challenge tokens.
-- When a user with 2FA enabled submits correct credentials, we do NOT create a
-- real session yet. Instead we issue a challenge_token that expires in 5 min.
-- The full session is only created once they supply a valid TOTP code.
CREATE TABLE IF NOT EXISTS totp_challenges (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_totp_challenges_token
    ON totp_challenges(token);

-- Cleanup: purge expired challenges (run periodically or on startup).
-- The query is safe to call any time; it is a no-op when nothing is expired.
-- Actual periodic cleanup is handled by the server on startup and every hour.
CREATE INDEX IF NOT EXISTS idx_totp_challenges_expires
    ON totp_challenges(expires_at);

-- Recovery / backup codes.
-- Each code is a random 32-character alphanumeric string hashed with SHA-256.
-- Codes are single-use: deleted from this table on consumption.
-- A full set of 10 codes is re-generated atomically (old codes are wiped first).
CREATE TABLE IF NOT EXISTS recovery_codes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT        NOT NULL,  -- SHA-256 hex digest of the plaintext code
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user
    ON recovery_codes(user_id);
