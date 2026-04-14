-- Winkd Messenger: avatar and profile colour persistence
-- avatar_data: base64-encoded image (up to 2 MB raw → ~2.7 MB base64); TEXT handles it
-- display_name_color: hex/rgba string for the name label colour in chat
-- av_color: hex string for the avatar background gradient start colour

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_data        TEXT,
    ADD COLUMN IF NOT EXISTS display_name_color VARCHAR(32),
    ADD COLUMN IF NOT EXISTS av_color           VARCHAR(32);
