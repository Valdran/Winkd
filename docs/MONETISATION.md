# Monetisation & Supporter Tiers

Winkd stays free, open source, and ad-free. Revenue comes from supporter
subscriptions and one-off cosmetic purchases via
[Buy Me a Coffee (BMAC)](https://buymeacoffee.com). This document covers the
tier limits the server enforces, why they're set where they are, and how the
BMAC webhook grants Max-tier access or unlocks emoji packs.

## Tiers at a glance

| Limit                     | Free tier | Max tier        |
|---------------------------|-----------|-----------------|
| Text message length       | 2 000     | 6 000           |
| Inline attachment (image) | 3 MB      | 10 MB           |
| Attachment link (GIF URL) | 1 024     | 2 048           |

These values live in `server/src/limits.rs` as `FREE_LIMITS` / `MAX_LIMITS`
and are echoed to the web client over the WebSocket `auth_ok` frame so the
UI renders the right character counter and pre-flight-checks paste/upload
sizes. The server validates every inbound `send_message` against the
sender's effective tier — a tampered client can't exceed its cap.

## Why these numbers?

The limits are dictated by real architectural bottlenecks, not arbitrary
choice:

- **Client persistence (localStorage) is ~5 MB per origin.** The web app
  stores the conversation history there so refreshing doesn't wipe chats.
  A free attachment cap of 3 MB means a single send doesn't blow the
  quota, leaving room for dozens of text messages and a handful of images.
- **WebSocket frames (tokio-tungstenite) default to 16 MiB.** Base64
  inflates binary by ~1.37×, so a Max-tier 10 MB image becomes ~13.7 MB in
  the JSON payload. We raise the server frame cap to 32 MiB in
  `WS_MAX_FRAME_BYTES` so that still fits comfortably.
- **PostgreSQL JSONB rows degrade past ~1 MB.** The offline message queue
  stores pending relays as JSONB. Most messages are well under the
  threshold; a Max-tier attachment is the outlier and still fits within
  the hard TOAST limit (1 GB) with plenty of headroom.
- **Text caps mirror Discord's 2 000 / 4 000 convention**, extended to
  6 000 for Max so long-form letters fit in a single bubble.

If we add video / large-file attachments later we'll move media to object
storage (S3 / R2) with signed upload URLs — inline base64 in the JSON
relay doesn't scale past ~10 MB without hurting perceived performance.

## BMAC integration

### Required env vars

| Variable                | Purpose                                                |
|-------------------------|--------------------------------------------------------|
| `BMAC_WEBHOOK_SECRET`   | Shared secret used to verify webhook signatures.       |
| `BMAC_MAX_TIER_NAME`    | BMAC membership level name that grants Max. Default `Max`. |

If `BMAC_WEBHOOK_SECRET` is unset the `/api/bmac/webhook` endpoint returns
503 — we'd rather refuse every webhook than silently accept unauthenticated
unlocks in production.

### Dashboard setup

1. In BMAC → **Integrations → Webhooks**, add a webhook pointing at
   `https://<your-host>/api/bmac/webhook`.
2. Pick **HMAC-SHA256** signing (BMAC sends the signature in the
   `X-Signature-Sha256` header).
3. Copy the generated secret into `BMAC_WEBHOOK_SECRET`.
4. Subscribe to at least these event types:
   - `membership.started`, `membership.renewed`, `membership.cancelled`
   - `extra.purchased` (for one-off emoji-pack unlocks)

### Recurring memberships → Max tier

When BMAC fires `membership.started` / `membership.renewed` we:

1. Verify the HMAC signature against `BMAC_WEBHOOK_SECRET`.
2. Record the event in `bmac_events` keyed by BMAC's transaction id — a
   retried webhook delivery is a no-op.
3. Look up the Winkd user by `supporter_email` (case-insensitive match
   on `users.email`).
4. If the membership level matches `BMAC_MAX_TIER_NAME`, set
   `users.supporter_tier = 'max'` and `supporter_expires_at` to BMAC's
   `current_period_end` (fallback: now + 35 days).

On `membership.cancelled` we downgrade immediately. The tier also
auto-downgrades when `supporter_expires_at` passes, via
`User::effective_tier()` — no background job needed.

Events for emails that don't match any user are still persisted so the
supporter can claim them later by setting the same email on their
account.

### One-off emoji packs

BMAC's **Extras** feature lets creators sell one-time products. Each
extra has a slug/id that BMAC surfaces in the `extra.purchased` webhook
payload. On receipt we append that id to `users.purchased_extras`
(deduped). The client reads `purchased_extras` from the `auth_ok` frame
and can gate pack availability in the emoji picker off that list.

Current packs planned:
- `emoji-pack-classic-msn` — the original MSN smiley set, licensed/redrawn.
- `emoji-pack-aero` — glass-themed reactions matching the Winkd aesthetic.
- `emoji-pack-pride` — limited-run seasonal pack, proceeds donated.

### Manual / admin unlocks

For grants, bug bounties, or Founding Member backfill, set the tier
directly with a SQL update:

```sql
UPDATE users
   SET supporter_tier = 'max',
       supporter_expires_at = NOW() + INTERVAL '1 year'
 WHERE winkd_id = 'example#1234';
```

This is deliberately a manual step — we don't want an "admin API" until
the admin side of the product has a proper auth layer.
