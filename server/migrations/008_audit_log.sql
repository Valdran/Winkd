-- ── Audit Log ─────────────────────────────────────────────────────────────
-- Immutable append-only log of security-relevant events.
-- user_id is nullable to allow pre-authentication events (e.g. login_failed
-- for a username that does not exist) to still be recorded.

CREATE TABLE IF NOT EXISTS audit_log (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    action     VARCHAR(64) NOT NULL,
    ip_address INET,
    metadata   JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the two most common query patterns:
--   • Fetch all events for a specific user (security page, support lookup)
--   • Fetch recent events across all users (admin monitoring)
CREATE INDEX IF NOT EXISTS idx_audit_log_user
    ON audit_log(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_created
    ON audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON audit_log(action);
