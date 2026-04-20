# React vs `app.html` feature gap

This report lists functionality implemented in the React app (`apps/web/src/**`) that differs from `apps/web/app.html`. Per `CLAUDE.md`, `app.html` is the canonical production UI; the React tree is a parallel reference.

## Status (2026-04-20)

Previously-tracked headline gaps are now closed in `app.html`:

- ✅ **Security center** — TOTP setup/confirm/disable, recovery code generation + remaining count, device list + revoke, and audit-log retrieval are all wired up (`openSecurityModal`, `loadSecuritySettings`, `loadSecurityAuditLog`). UX parity with React landed: friendly action labels, formatted dates, IP column, scrollable list, low-codes warning, dedicated regenerate-code input. TOTP setup now also renders the `otpauth://` URI as a real QR canvas (`drawTotpQr`, using the already-loaded `qrcode.min.js`) alongside the manual-entry secret, so app.html is now **ahead** of the React reference on this flow.
- ✅ **Blocked users management** — `list_blocked` / `blocked_list` / `unblock_contact` handled; blocked list browsable and unblockable from the sidebar.
- ✅ **Socket event parity** — `handleServerEvent` covers `contacts_snapshot`, `presence`, `contact_request`, `contact_request_sent`, `contact_accepted`, `contact_request_rejected`, `contact_blocked`, `contact_unblocked`, `blocked_list`, `message`, `error`.
- ✅ **Crash-containment** — `window.error` + `unhandledrejection` listeners with a fatal-overlay fallback are in place (guarded by `__winkdBooted` to avoid tearing the UI down after a successful render).
- ✅ **Message model** — `send_message` is the only outbound path; typed payloads (`text` / `winkd` / `nudge` / `wink`) with stable IDs, ISO timestamps and delivery/read flags. The previous fake-reply bot simulation is gone. Outgoing optimistic render and inbound server relay share a single `payloadToUiMessage` mapper so the id-based dedup that collapses the server echo cannot be defeated by drift.

## Remaining differences worth tracking

1. **Per-surface drift prevention** — Because `app.html` is canonical, the React tree in `apps/web/src/**` will keep drifting unless we either (a) retire it, or (b) codify which pieces must stay in lockstep. Decision pending. Until then, treat React source as a *reference implementation* only, not a production path.

2. **React reference is now behind on TOTP QR** — `SecuritySettings.tsx` still shows the `otpauth://` URI as text. If the React tree is kept, port the QR canvas back to parity.

## Suggested next order

1. Decide the fate of `apps/web/src/**` and record it in `CLAUDE.md` (keep in lockstep, freeze as reference, or delete).
2. If kept: backport the QR canvas into `SecuritySettings.tsx`.
3. Beyond parity: in-app `otpauth://` link that opens the user's authenticator directly on mobile (already implicit in the URI, but not surfaced as a clickable affordance on either surface).
