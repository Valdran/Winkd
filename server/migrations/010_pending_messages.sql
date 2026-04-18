-- Winkd Messenger: pending (offline) message queue
-- Runs automatically on server startup via sqlx::migrate!
--
-- When a message is sent to a recipient whose WebSocket is not currently
-- connected, we store the raw relay payload here so it can be delivered
-- the next time they authenticate a WebSocket session. Without this the
-- server previously dropped the message entirely.

CREATE TABLE IF NOT EXISTS pending_messages (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- client-generated message id (from mkMsgId on the web app) used for
    -- idempotent queueing if the sender retries a command
    client_msg_id TEXT,
    payload       JSONB       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_messages_recipient_created
    ON pending_messages(recipient_id, created_at);

-- Prevent the same client_msg_id being queued twice for the same recipient
-- (retry from the sender, or two send_message commands colliding). Rows
-- without a client_msg_id are allowed to duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_messages_recipient_client
    ON pending_messages(recipient_id, client_msg_id)
    WHERE client_msg_id IS NOT NULL;
