# Winkd Monetisation

Winkd is free, open source (MIT), and will never show ads or sell user
data. Revenue comes from two sources: a monthly supporter subscription
(**Winkd Plus!**) and one-off lifetime unlocks sold as BMAC Extras.

Everything is priced to feel like "a coffee" — well under what Discord,
Slack, or any chat SaaS charges, and competitive with what people paid for
MSN Plus! back in the day (which was €12–20/yr for a community-made plugin).

---

## Pricing — all amounts in CAD

### Winkd Plus! (monthly subscription)

| Plan | Price | BMAC membership level |
|---|---|---|
| Plus! monthly | **$2.99 / mo** | `Winkd Plus!` |
| Plus! yearly | **$24.99 / yr** *(~$2.08/mo, save 30%)* | `Winkd Plus! Annual` |

*For reference: Discord Nitro Basic is $3.99 CAD/mo, Nitro is $11.99/mo.
Winkd Plus! is intentionally cheaper than both.*

### One-off lifetime unlocks (BMAC Extras)

| Item | Price | SKU | Effect |
|---|---|---|---|
| Buddy Slots +10 | **$1.99** | `buddy-slots-10` | Permanently raises buddy-list cap by 10 (stackable) |
| Group Conversations | **$4.99** | `group-unlock` | Host can create group chats; invitees join free |
| Spikey Emoji Pack | **$3.99** | `emoji-pack-spikey` | Unlocks the Spikey mascot emoji set in the picker |
| MSN Classic Emoji Pack | **$3.99** | `emoji-pack-classic-msn` | Redrawn originals — the yellow faces, the dancing banana |
| Wink Pack — Aero Glass | **$2.99** | `wink-pack-aero` | Full-screen Wink animations in frosted-glass style |
| Wink Pack — Y2K Party | **$2.99** | `wink-pack-y2k` | Retro party animations — confetti, spinning stars, pixel hearts |
| Chat Backgrounds | **$2.99** | `bg-pack-y2k` | Extra background textures for the chat window |
| Sound Pack — MSN Era | **$1.99** | `sound-pack-msn` | Swap nudge/message sounds to classic MSN-style audio |
| Founding Member | **$9.99** (one-off) | `founding-member` | Permanent badge; limited to first 500 supporters |

---

## What Plus! unlocks

| Feature | Free | Plus! |
|---|---|---|
| Buddy list cap | 25 (+ slot packs) | Unlimited |
| Text message length | 2 000 chars | 6 000 chars |
| Inline attachment size | 3 MB | 10 MB |
| Animated buddy-icon frames | — | Included |
| Plus! badge in profile | — | ✓ |
| Profile name colour | Limited palette | Full palette |

Things that are **always free** regardless of tier: messaging, contact
requests, end-to-end encryption, Winkd/Nudge, status + mood, buddy icons,
read receipts, offline message delivery, the PWA itself.

---

## Buddy-list cap design

Free users start with a **25-buddy cap**. The cap grows by 10 for each
`buddy-slots-10` extra purchased (stackable, permanent). Plus! removes the
cap entirely.

The server enforces this on the `add_contact` WebSocket command and reflects
the current state (`buddy_used`, `buddy_cap`) in every `auth_ok` frame. The
client sidebar shows a live counter (e.g. `18 / 25 buddies`) that turns amber
near the cap and red when full, with an inline **Get Plus!** prompt.

### Why 25?

- High enough that most casual users never hit it.
- Low enough that heavy users — the ones Winkd is actually designed for —
  will want to remove the cap, which is the product's whole value proposition.
- MSN Messenger famously had a 150-buddy limit on free accounts (and a 600
  limit on paid); 25 is deliberately tighter for the v1.0 micro-community
  positioning.

---

## Group conversations

Group chats are a Phase 4 / v1.1 feature (see CLAUDE.md). The
`group-unlock` extra is pre-sold today so early supporters can lock in the
$4.99 price. When groups ship:

- The **host** must have `group_chat_unlocked = true` to create a group.
- **Invitees** join free — they don't need to buy anything.
- Groups are small and intimate (planned cap: 20 members) — not Discord-style
  servers.

---

## BMAC integration

### Required env vars

| Variable | Default | Purpose |
|---|---|---|
| `BMAC_WEBHOOK_SECRET` | *(required)* | HMAC-SHA256 key — unset disables the endpoint |
| `BMAC_PLUS_TIER_NAME` | `Winkd Plus!` | Membership level name in BMAC dashboard |

### Dashboard setup

1. **BMAC → Integrations → Webhooks**: add `https://<host>/api/bmac/webhook`.
2. Signing method: **HMAC-SHA256** (header: `X-Signature-Sha256`).
3. Copy the generated secret into `BMAC_WEBHOOK_SECRET`.
4. Subscribe to: `membership.started`, `membership.renewed`,
   `membership.cancelled`, `extra.purchased`.
5. In BMAC → **Extras**, create one product per SKU row in the table above.
   Set the SKU/slug field to match exactly (e.g. `buddy-slots-10`).

### How the webhook maps to the user

Winkd matches the BMAC `supporter_email` against `users.email`
(case-insensitive). If no match exists the event is still recorded in
`bmac_events` for manual resolution or future claim (e.g. the user registers
later with the same email).

### Membership lifecycle

| BMAC event | Server action |
|---|---|
| `membership.started` / `membership.renewed` | Set `supporter_tier='plus'`, `supporter_expires_at` = period end + 5 days grace |
| `membership.cancelled` | Downgrade to `'free'` immediately |
| Expiry (no renewal) | `User::effective_tier()` auto-downgrades — no cron job needed |

### One-off extras

The server reads the `sku`/`extra_id`/`extra_slug` field from the BMAC
payload and applies the matching side effect:

| SKU | Side effect |
|---|---|
| `buddy-slots-10` | `extra_buddy_slots += 10` |
| `group-unlock` | `group_chat_unlocked = true` |
| Anything else | Appended to `purchased_extras[]` (emoji/wink/bg/sound packs) |

### Manual admin unlock

```sql
-- Grant Plus! for a year
UPDATE users
   SET supporter_tier = 'plus',
       supporter_expires_at = NOW() + INTERVAL '1 year'
 WHERE winkd_id = 'example#1234';

-- Grant buddy slots
UPDATE users SET extra_buddy_slots = extra_buddy_slots + 10
 WHERE winkd_id = 'example#1234';

-- Grant group unlock
UPDATE users SET group_chat_unlocked = TRUE
 WHERE winkd_id = 'example#1234';

-- Grant emoji pack
UPDATE users
   SET purchased_extras = array_append(purchased_extras, 'emoji-pack-spikey')
 WHERE winkd_id = 'example#1234';
```

---

## Emoji pack authoring

Pack assets live in `apps/web/public/emoji-packs/<sku>/`. See
`apps/web/public/emoji-packs/README.md` for the image spec and
`manifest.json` schema. Drop PNGs/GIFs into the pack folder, update
`manifest.json`, and they're live on next deploy.

Current packs:
- `spikey` — Winkd's original spiky-haired mascot (artwork TBD)
- `classic-msn` — Redrawn originals, licensed/original artwork
- *(more planned)*
