-- Winkd Messenger: persist display_name changes and add mood_message
-- Runs automatically on server startup via sqlx::migrate!

-- mood_message: free-text status line, max 100 chars, persisted across restarts.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mood_message VARCHAR(100) NOT NULL DEFAULT '';
