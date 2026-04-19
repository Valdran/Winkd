-- Winkd Messenger: buddy-slot packs + group-conversation unlock
--
-- extra_buddy_slots: stacks permanently. Each "buddy-slots-10" BMAC extra
--   purchase adds 10. Free-tier effective cap = FREE_BUDDY_CAP + extra_buddy_slots.
--   Plus! subscribers have no cap (computed in User::buddy_cap()).
--
-- group_chat_unlocked: host-only one-off purchase. Guests they invite don't
--   need this flag. Group-chat logic is Phase 4; this column reserves the
--   schema space and lets the BMAC webhook pre-sell the unlock today.
--
-- Also migrates anyone who already had supporter_tier = 'max' (internal
-- testing) to 'plus' to match the renamed constant.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS extra_buddy_slots  INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS group_chat_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

-- Rename the old internal tier value so no rows are stranded on the old string.
UPDATE users SET supporter_tier = 'plus' WHERE supporter_tier = 'max';
