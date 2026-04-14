-- ── Multi-device Support ───────────────────────────────────────────────────
-- Tracks registered devices per user and upgrades pre_key_bundles to be
-- keyed per-device rather than per-user.

-- Device registry.
-- One row per registered device. A device is registered when the client
-- uploads its pre_key_bundle (device_name supplied at that time).
-- device_id matches the device_id column in pre_key_bundles.
CREATE TABLE IF NOT EXISTS devices (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id     INT          NOT NULL,
    device_name   VARCHAR(64)  NOT NULL DEFAULT 'Unknown Device',
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

-- Migrate pre_key_bundles from per-user to per-(user, device) primary key.
-- Existing rows all have device_id = 1 so the data is preserved intact.
ALTER TABLE pre_key_bundles DROP CONSTRAINT IF EXISTS pre_key_bundles_pkey;
ALTER TABLE pre_key_bundles ADD PRIMARY KEY (user_id, device_id);

-- Backfill device registry entries for any pre_key_bundles already present.
INSERT INTO devices (user_id, device_id, device_name)
SELECT user_id, device_id, 'Primary Device'
FROM   pre_key_bundles
ON CONFLICT (user_id, device_id) DO NOTHING;
