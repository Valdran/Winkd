# Winkd Messenger

> The personality of early-2000s instant messaging — buddy lists, away messages, Winks, Nudges — rebuilt from scratch with modern security and end-to-end encryption.

**Free. Open source (MIT). No ads. No data sold. Ever.**

---

## Security Architecture

Winkd is designed from the ground up so that private conversations stay private — even from the Winkd servers.

### End-to-End Encryption — Signal Protocol

Every message is encrypted on your device before it leaves. The server relays opaque encrypted blobs and has no ability to read them.

| Layer | What's used |
|---|---|
| Key agreement | X3DH (Extended Triple Diffie-Hellman), P-256 ECDH |
| Ongoing sessions | Double Ratchet algorithm |
| Message cipher | AES-256-GCM with a fresh random IV per message |
| Key derivation | HKDF-SHA256 |
| Signature verification | ECDSA-P256-SHA256 on signed pre-keys |
| Fingerprints | 60-digit safety numbers via SHA-512 (manual verification) |

**Forward secrecy:** The Double Ratchet rotates keys with every message. Compromising today's keys does not expose yesterday's conversations.

**Break-in recovery:** Root key evolution means that even if an attacker briefly gains access to key material, the damage is contained to that window and does not persist.

**Out-of-order delivery:** The session manager caches up to 500 skipped message keys so messages arriving out of sequence can still be decrypted without breaking the ratchet chain.

### Key Storage

Keys are stored in the browser's IndexedDB under the `winkd_keys` database, scoped to your device's origin. They are **never transmitted to the server** and **never leave your device**.

- Identity key pair (long-term)
- Signed pre-key (rotatable)
- One-time pre-keys (consumed once each, then discarded)
- Ratchet session state per conversation

### Identity Key Exchange (X3DH)

When you add a contact, your client fetches their pre-key bundle from the server and performs a 3-step (optionally 4-step) Diffie-Hellman computation locally. The server never participates in this computation — it only stores the public half of each user's pre-key bundle.

One-time pre-keys are consumed atomically: each key is used for exactly one session initiation and then deleted from the server.

### Safety Numbers

Every conversation has a 60-digit safety number derived deterministically from both users' identity keys and Winkd IDs (via SHA-512). You can compare this number out-of-band (in person, over a phone call) to verify you are talking to who you think you are and that no man-in-the-middle is present.

---

## Authentication Security

### Password Hashing

Passwords are hashed with **Argon2id** before storage. No plaintext passwords ever touch the database.

| Parameter | Value |
|---|---|
| Algorithm | Argon2id (hybrid side-channel resistance) |
| Memory cost | 128 MB |
| Iterations | 4 |
| Minimum password length | 12 characters |
| Complexity requirement | Uppercase + lowercase + digit |

### Session Tokens

- Tokens are **256-bit cryptographically random** values (`rand::thread_rng().fill_bytes()` — not UUID, not sequential, not guessable)
- Stored in PostgreSQL; expire after 30 days
- **Never placed in URLs** — sent in request headers and as the first WebSocket message to prevent exposure in server access logs, browser history, and `Referer` headers

### WebSocket Authentication

Authentication happens via the first message of the WebSocket connection (not a query parameter):

```json
{ "type": "auth", "token": "<session-token>" }
```

- Server waits a maximum of **5 seconds** for the auth frame
- On success: server responds with `auth_ok` and the connection is live
- On failure: server closes the socket with code `4001 Unauthorized`; the client does not attempt to reconnect (the session is invalid)

### Rate Limiting

Brute-force protection on authentication endpoints, enforced per IP address:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 requests / minute |
| `POST /api/auth/register` | 5 requests / minute |

### Two-Factor Authentication (TOTP)

TOTP 2FA is available on all accounts and optional but strongly recommended.

| Detail | Implementation |
|---|---|
| Standard | RFC 6238 (TOTP) / RFC 4226 (HOTP) |
| Algorithm | HMAC-SHA1 |
| Secret | 160-bit random, Base32-encoded |
| Code length | 6 digits |
| Window | ±1 step (30 seconds each side) for clock skew |
| URI | `otpauth://totp/` — compatible with all authenticator apps |

**Login flow with 2FA enabled:**
1. Correct password → server issues a short-lived (5-minute) `challenge_token` — no session created yet
2. Client submits `challenge_token` + 6-digit code to `/api/auth/totp/challenge`
3. Server verifies code (or backup code), creates full session
4. Challenge token is deleted on first use regardless of outcome

**Setup flow:** generate secret → display QR code / raw Base32 → confirm with first valid code → 2FA enabled + backup codes issued atomically.

### Account Recovery — Backup Codes

10 backup codes are generated when 2FA is first enabled. They are single-use replacements for the TOTP code at login.

| Detail | Implementation |
|---|---|
| Format | 32-character random alphanumeric (128-bit entropy) |
| Hashing | SHA-256 (high-entropy input — SHA-256 is appropriate; Argon2 would be wasteful) |
| Storage | Hashed copies only — plaintext never persisted |
| Expiry | Single-use: deleted from DB on consumption |
| Regeneration | Requires a valid live TOTP code; old set wiped atomically |
| Remaining count | Exposed via `GET /api/auth/recovery-codes` so the client can warn when running low |

### OAuth / Social Login

12 providers supported (Discord, Google, Apple, Microsoft, Facebook, X/Twitter, Twitch, Reddit, Spotify, LinkedIn, Steam).

Security measures applied to every OAuth flow:

- **PKCE (Proof Key for Code Exchange):** SHA-256 code challenge and verifier prevent authorization code interception attacks
- **CSRF protection:** State validated via an HttpOnly `SameSite=Strict` cookie (`winkd_oauth_state`) containing provider + CSRF token + PKCE verifier + timestamp — no server-side state session required
- **Cookie expiry:** 10 minutes (`Max-Age=600`) — short enough to prevent replay
- **Email deduplication:** If an OAuth email matches an existing account, the OAuth identity is linked rather than creating a duplicate account
- **OAuth-only accounts:** Users who register via OAuth have `NULL` password hashes — there is no password to leak

---

## Device Management

Each device registers independently with its own pre-key bundle, giving the server per-device Signal Protocol state.

| Operation | Endpoint |
|---|---|
| Upload bundle + register device | `POST /api/keys/bundle` |
| Fetch peer bundle for X3DH | `GET /api/keys/bundle/:winkd_id` |
| List my devices | `GET /api/devices` |
| Revoke a device | `DELETE /api/devices/:device_id` |

- Pre-key bundles are keyed `(user_id, device_id)` — one bundle per device, not per user
- One-time pre-keys are consumed atomically on fetch (each key used for exactly one X3DH session initiation)
- Revoking a device deletes its pre-key bundle and device record; any in-flight sessions using that bundle expire naturally
- The in-app Security panel lists all devices with registration date and last-seen timestamp

---

## Structured Audit Log

Every security-relevant event is appended to an immutable `audit_log` table (PostgreSQL). Log writes are fire-and-forget — a DB hiccup never breaks the auth flow.

**Logged events:**

| Action | When |
|---|---|
| `login` | Successful password login |
| `login_failed` | Wrong password, unknown user, or OAuth-only account |
| `register` | New account created |
| `logout` | Session invalidated |
| `totp_challenge_issued` | 2FA required — challenge token sent |
| `totp_challenge_passed` | Correct TOTP code — full session created |
| `totp_challenge_failed` | Wrong TOTP code |
| `totp_enabled` | 2FA enabled on account |
| `totp_disabled` | 2FA disabled on account |
| `recovery_code_used` | Backup code redeemed (remaining count in metadata) |
| `recovery_codes_regenerated` | Full backup code set replaced |
| `device_registered` | Pre-key bundle uploaded / device registered |
| `device_revoked` | Device removed by user |
| `password_changed` | Password updated |
| `all_sessions_revoked` | All sessions invalidated |

Each entry stores: `user_id`, `action`, `ip_address` (PostgreSQL `INET`), `metadata` (JSONB for structured context), `created_at`.

Users can view their own last 100 events via `GET /api/security/audit-log`. The in-app Security panel renders them with human-readable labels and timestamps.

---

## Transport Security

All production traffic is served over **TLS 1.2+** via a reverse proxy (nginx / Caddy). The Rust server does not handle TLS termination directly; this is an intentional deployment architecture separating concerns.

---

## Database Design

- **UUID v4 primary keys** on all tables — opaque, non-enumerable IDs
- **Email uniqueness** enforced at database level
- **Timestamptz** on all rows for audit trails (`created_at`, `updated_at`)
- **Pre-key bundle isolation:** One-time pre-keys are stored separately from the main user record and consumed atomically
- **Per-device key bundles:** `pre_key_bundles` is keyed `(user_id, device_id)`, not just `user_id`
- **TOTP state isolation:** `totp_secret` and `totp_enabled` stored separately from the main user record; secret is wiped when 2FA is disabled
- **Recovery codes:** hashed separately in `recovery_codes` table — never co-located with the plaintext
- **Audit log append-only:** `audit_log` has no UPDATE or DELETE privileges in normal operation; indexed on `user_id`, `created_at DESC`, and `action`

---

## What the Server Can and Cannot See

| Data | Server access |
|---|---|
| Your message content | Never — encrypted before leaving your device |
| Who you talk to (contact graph) | Yes — contact relationships stored in DB |
| When you were online | Yes — presence metadata |
| Your IP address | Yes — standard for any networked service |
| Your password | Never — only the Argon2id hash |
| Your encryption keys | Never — stored only on your device |
| Your safety number | No — computed client-side only |

Winkd's design ensures that a server compromise, a subpoena, or a rogue Winkd employee **cannot** access the content of your messages.

---

## Open Source Auditability

The full source code is available at [github.com/valdran/winkd](https://github.com/valdran/winkd) under the **MIT licence**. The encryption implementation lives in `packages/core/src/encryption/`. Anyone can read it, audit it, and run it.

Key files:
- `packages/core/src/encryption/crypto.ts` — X3DH, ECDH, ECDSA, AES-GCM, HKDF primitives
- `packages/core/src/encryption/session.ts` — Double Ratchet session manager
- `packages/core/src/encryption/keystore.ts` — IndexedDB key storage layer
- `server/src/auth.rs` — Argon2id hashing, session management, OAuth, 2FA, device management
- `server/src/totp.rs` — RFC 6238 TOTP implementation with RFC 4226 test vectors
- `server/src/audit.rs` — Structured security audit log
- `server/src/ratelimit.rs` — Per-IP rate limiting
- `server/migrations/006_totp_and_recovery.sql` — TOTP + backup codes schema
- `server/migrations/007_multi_device.sql` — Per-device pre-key bundles + device registry
- `server/migrations/008_audit_log.sql` — Audit log table

---

## Privacy Principles

- No advertising — ever
- No analytics without explicit opt-in
- No user data sold
- GDPR and PIPEDA compliant by design
- Self-hostable: run your own instance with `docker compose up`
- Federated server support planned for v2

---

## Installing as a PWA

### Android / Chrome
- Open the app in Chrome
- Tap the three-dot menu → "Add to Home Screen"
- Or wait for the install banner to appear automatically

### iOS / Safari
- Open in Safari
- Tap the Share button (⎙)
- Tap "Add to Home Screen"

### Desktop (Chrome / Edge)
- Look for the install icon (⊕) in the address bar
- Or wait for the install banner in the app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Tauri (Rust + React) |
| Mobile | React Native (iOS + Android) |
| Web / PWA | Core client UI currently shipped from `apps/web/app.html` (legacy DOM app); React + TypeScript code exists in `apps/web/src` but is not the default core app path |
| Server | Rust, WebSockets, PostgreSQL, Redis |
| Encryption | Signal Protocol (libsignal / WebCrypto) |
| Package manager | pnpm workspaces + Turborepo |

---

## Licence

MIT — see [LICENSE](LICENSE)
