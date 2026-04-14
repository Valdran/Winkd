-- Pre-key bundles for Signal Protocol X3DH key agreement.
-- Clients upload their key material here after registration;
-- peers fetch it to initiate an encrypted session.

-- ── Identity & signed pre-keys ─────────────────────────────────────────────
-- One row per device (currently one device per user).
CREATE TABLE IF NOT EXISTS pre_key_bundles (
    user_id             UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    registration_id     INT          NOT NULL,
    device_id           INT          NOT NULL DEFAULT 1,
    -- P-256 identity public key, raw bytes, base64
    identity_key        TEXT         NOT NULL,
    -- Signed pre-key fields
    spk_id              INT          NOT NULL,
    spk_public_key      TEXT         NOT NULL,
    spk_signature       TEXT         NOT NULL,
    uploaded_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── One-time pre-keys ──────────────────────────────────────────────────────
-- Each key is consumed (deleted) once an initiator uses it for X3DH.
-- The server returns at most one per bundle fetch and deletes it atomically.
CREATE TABLE IF NOT EXISTS one_time_pre_keys (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id      INT     NOT NULL,
    public_key  TEXT    NOT NULL,
    UNIQUE (user_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_one_time_pre_keys_user
    ON one_time_pre_keys(user_id);
