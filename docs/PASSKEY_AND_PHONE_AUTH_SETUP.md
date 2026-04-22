# Passkey + Phone Verification Setup Guide

This guide explains how to get both **Passkey sign-in** and **Phone verification code sign-in** working in Winkd.

> Current repo status (as of this document): the login UI calls passkey/phone endpoints, but the server router currently only mounts password, OAuth, and TOTP routes. You must add backend support before these methods can be configured in production.

---

## 1) What is already present vs missing

### Already present
- Login UI has flows for:
  - `POST /api/auth/passkey/begin`
  - `POST /api/auth/passkey/finish`
  - `POST /api/auth/phone/request-otp`
  - `POST /api/auth/phone/resend-otp`
  - `POST /api/auth/phone/verify`
- Existing auth/session patterns for password + OAuth + TOTP can be reused.

### Missing (must be implemented)
- No server routes are registered for passkey or phone auth yet.
- No config/env fields for WebAuthn RP settings or SMS provider settings.
- No DB tables for passkey credentials or phone OTP challenges.

---

## 2) Architecture you should implement

### Passkey (WebAuthn authentication)
1. **Begin** endpoint creates a short-lived challenge and returns `publicKey` options.
2. Browser gets an assertion via `navigator.credentials.get()`.
3. **Finish** endpoint verifies assertion signature/challenge/counter and issues Winkd session token.

### Phone OTP authentication
1. **Request OTP** validates phone, creates challenge/token, stores hashed code + expiry, sends SMS.
2. **Resend OTP** rotates code for same challenge within rate limits.
3. **Verify OTP** checks challenge+code+expiry and issues Winkd session token.

---

## 3) Required backend changes

## 3.1 Add env/config support (`server/src/config.rs`)
Add fields for:

```text
# passkey
WINKD_PASSKEY_ENABLED=true
WINKD_WEBAUTHN_RP_ID=localhost
WINKD_WEBAUTHN_RP_NAME=Winkd Messenger
WINKD_WEBAUTHN_ORIGIN=http://localhost:8080

# phone sms
WINKD_PHONE_AUTH_ENABLED=true
WINKD_SMS_PROVIDER=twilio
WINKD_TWILIO_ACCOUNT_SID=...
WINKD_TWILIO_AUTH_TOKEN=...
WINKD_TWILIO_FROM=+1...
WINKD_OTP_TTL_SECONDS=300
WINKD_OTP_RESEND_COOLDOWN_SECONDS=30
WINKD_OTP_MAX_ATTEMPTS=5
```

Recommended: keep both auth methods disabled by default unless all required vars are present.

## 3.2 Add DB migrations (`server/migrations`)
Create migrations for:

### A) Passkey credentials
- `passkey_credentials`
  - `id uuid pk`
  - `user_id uuid not null references users(id)`
  - `credential_id text unique not null`
  - `public_key bytea not null`
  - `sign_count bigint not null default 0`
  - `transports text[] null`
  - `created_at timestamptz not null default now()`
  - `last_used_at timestamptz null`

### B) Passkey auth challenges
- `passkey_auth_challenges`
  - `challenge_token text pk`
  - `challenge text not null`
  - `expires_at timestamptz not null`
  - `used boolean not null default false`

### C) Phone OTP challenges
- `phone_otp_challenges`
  - `challenge_token text pk`
  - `phone_e164 text not null`
  - `code_hash text not null`
  - `attempts int not null default 0`
  - `max_attempts int not null`
  - `expires_at timestamptz not null`
  - `resend_after timestamptz not null`
  - `used boolean not null default false`
  - `created_at timestamptz not null default now()`

Store only hashed OTP codes (never plaintext).

## 3.3 Add server handlers (`server/src/auth.rs`)
Implement:

- `passkey_begin`
- `passkey_finish`
- `phone_request_otp`
- `phone_resend_otp`
- `phone_verify_otp`

Behavior checklist:
- Normalize + validate input.
- Rate limit by IP + phone.
- Use constant-time compare for OTP verification.
- Expire/consume challenges atomically.
- Return the same session payload shape used by existing login methods.

## 3.4 Mount routes (`server/src/router.rs`)
Register:

```rust
.route("/api/auth/passkey/begin", post(auth::passkey_begin))
.route("/api/auth/passkey/finish", post(auth::passkey_finish))
.route("/api/auth/phone/request-otp", post(auth::phone_request_otp))
.route("/api/auth/phone/resend-otp", post(auth::phone_resend_otp))
.route("/api/auth/phone/verify", post(auth::phone_verify_otp))
```

---

## 4) SMS provider integration (Twilio example)

## 4.1 E.164 formatting
Accept user number + country code from UI and always convert to E.164 before storing/sending.

## 4.2 Send OTP safely
- Generate 6-digit numeric OTP.
- Hash with Argon2/Bcrypt/PBKDF2 and store hash.
- SMS body example: `Your Winkd code is 123456. Expires in 5 minutes.`
- Do not log OTP value.

## 4.3 Anti-abuse controls
- Per-IP request rate limits.
- Per-phone daily quota.
- Resend cooldown.
- Hard lock after max attempts.

---

## 5) Passkey/WebAuthn specifics

## 5.1 RP settings
- Local:
  - RP ID: `localhost`
  - Origin: `http://localhost:8080`
- Production:
  - RP ID: your base domain (e.g. `winkd.com`)
  - Origin: exact HTTPS app origin (e.g. `https://app.winkd.com`)

`rpId` and browser origin must match WebAuthn rules exactly.

## 5.2 Challenge lifecycle
- Challenges should be single-use and short-lived (2–5 minutes).
- Mark used in one transaction when verified.

## 5.3 Signature counter
- Persist latest `sign_count` and reject clearly cloned/replayed authenticator states.

---

## 6) Frontend behavior after backend is ready

The login UI already has phone/passkey flows. After backend implementation:
1. Ensure server returns JSON errors with explicit messages (`not configured`, `invalid code`, `expired code`).
2. Verify initial tab states update correctly after capability probing.
3. Ensure successful phone/passkey login returns:
   - `session_token`
   - `winkd_id`
   - `display_name`
   - optional profile fields used elsewhere

---

## 7) Local testing plan

## 7.1 Run services
- Postgres + Redis up
- server running on `:8080`
- env vars set for Twilio and passkey RP settings

## 7.2 API smoke checks

```bash
# should return passkey challenge JSON
curl -i -X POST http://localhost:8080/api/auth/passkey/begin

# request phone OTP
curl -i -X POST http://localhost:8080/api/auth/phone/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+15551234567"}'
```

## 7.3 End-to-end checks
- Passkey flow succeeds in Chrome/Safari with platform authenticator.
- Wrong/expired OTP rejected.
- Resend respects cooldown.
- Rate limits enforced.

---

## 8) Production rollout checklist

- [ ] HTTPS enabled (mandatory for passkeys outside localhost).
- [ ] Correct production RP ID + Origin configured.
- [ ] Twilio sender number verified and allowed for target regions.
- [ ] Alerting on SMS failures and auth error spikes.
- [ ] Audit logs for passkey/phone challenge events.
- [ ] Abuse monitoring dashboards.

---

## 9) Troubleshooting

### "Passkey sign-in is not configured on this server"
- Route missing in router.
- Passkey env vars missing.
- RP ID / Origin mismatch.
- Running on non-HTTPS origin (non-localhost).

### "Could not send verification code"
- Twilio creds invalid.
- Sender number not approved/usable.
- Phone number not valid E.164.
- Route missing or phone auth disabled.

### OTP verify always fails
- Stored hash mismatch bug.
- Challenge expired/used.
- Code normalization issue (spaces, unicode digits, etc.).

---

## 10) Suggested implementation order

1. Add config/env parsing.
2. Add DB migrations and DB access functions.
3. Add phone OTP endpoints + tests.
4. Add passkey endpoints + tests.
5. Register routes.
6. Validate UI flows end-to-end in local and production-like env.

