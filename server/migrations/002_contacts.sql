-- Winkd Messenger: contact requests
-- Runs automatically on server startup via sqlx::migrate!

CREATE TABLE IF NOT EXISTS contact_requests (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    from_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'pending' until the recipient accepts or declines
    status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A user can only have one outstanding request to another user at a time.
    -- If they re-send after declining, the row is reset to 'pending'.
    UNIQUE(from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_to
    ON contact_requests(to_id) WHERE status = 'pending';
