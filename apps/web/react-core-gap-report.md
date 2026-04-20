# React vs `app.html` feature gap

This report lists functionality implemented in the React app (`apps/web/src/**`) that differs from `apps/web/app.html`. Per `CLAUDE.md`, `app.html` is the canonical production UI; the React tree is a parallel reference.

## Status (2026-04-20)

Previously-tracked headline gaps are now closed in `app.html`:

- ✅ **Security center** — TOTP setup/confirm/disable, recovery code generation + remaining count, device list + revoke, and audit-log retrieval are all wired up (`openSecurityModal`, `loadSecuritySettings`, `loadSecurityAuditLog`). UX polish parity with React (friendly action labels, formatted dates, IP column, scrollable list, low-codes warning, dedicated regenerate-code input) landed in this change.
- ✅ **Blocked users management** — `list_blocked` / `blocked_list` / `unblock_contact` handled; blocked list browsable and unblockable from the sidebar.
- ✅ **Socket event parity** — `handleServerEvent` covers `contacts_snapshot`, `presence`, `contact_request`, `contact_request_sent`, `contact_accepted`, `contact_request_rejected`, `contact_blocked`, `contact_unblocked`, `blocked_list`, `message`, `error`.
- ✅ **Crash-containment** — `window.error` + `unhandledrejection` listeners with a fatal-overlay fallback are in place (guarded by `__winkdBooted` to avoid tearing the UI down after a successful render).

## Remaining differences worth tracking

1. **Message model normalization** — React's chat store sends typed payloads (`text` / `winkd` / `nudge`) with stable IDs, ISO timestamps and delivery/read flags via `send_message`. `app.html` still keeps some UI-local message objects and retains a local fake-reply simulation for online contacts in a few code paths. Aligning `app.html` to the `send_message`-only model (and killing the simulation) is the next backport target.

2. **QR rendering for TOTP setup** — Both surfaces currently show the `otpauth://` URI as text. Rendering it as an actual QR image inside the setup modal would materially reduce friction. This is a forward improvement rather than a backport.

3. **Per-surface drift prevention** — Because `app.html` is canonical, the React tree will keep drifting unless we either (a) decide to retire the React tree, or (b) codify which pieces must stay in lockstep. Decision pending.

## Suggested next order

1. Message model normalization in `app.html` (kill local fake reply, enforce typed `send_message` payloads).
2. QR image rendering in the TOTP setup card (both surfaces).
3. Decide the fate of `apps/web/src/**` and record it in `CLAUDE.md`.
