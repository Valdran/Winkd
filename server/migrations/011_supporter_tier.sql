-- Winkd Messenger: supporter tiers & cosmetic purchases
--
-- Adds the columns the server needs to enforce tier-aware limits and track
-- which cosmetic extras a user has unlocked (emoji packs, etc.). The Max
-- tier is granted automatically by the Buy Me a Coffee (BMAC) webhook when
-- a matching membership/extra purchase arrives — see src/bmac.rs and
-- docs/MONETISATION.md.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS supporter_tier VARCHAR(16) NOT NULL DEFAULT 'free';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS supporter_expires_at TIMESTAMPTZ NULL;

-- Which emoji packs (and other one-shot extras) the user has bought. Stored
-- as a simple string array so we don't need a join table just to check for
-- membership on the UI. Packs are identified by BMAC extra_id.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS purchased_extras TEXT[] NOT NULL DEFAULT '{}';

-- Raw BMAC events kept for idempotency + audit. `external_id` is the BMAC
-- transaction / membership id so a retried webhook won't double-unlock.
CREATE TABLE IF NOT EXISTS bmac_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id     TEXT        UNIQUE NOT NULL,
    event_type      TEXT        NOT NULL,
    supporter_email TEXT,
    user_id         UUID        NULL REFERENCES users(id) ON DELETE SET NULL,
    amount_cents    INTEGER,
    currency        VARCHAR(8),
    raw_payload     JSONB       NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bmac_events_user
    ON bmac_events(user_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_supporter_expires
    ON users(supporter_expires_at) WHERE supporter_tier <> 'free';
