# React vs `app.html` feature gap (core upgrades to backport)

This report lists functionality implemented in the React app (`apps/web/src/**`) that is missing or only partially implemented in `apps/web/app.html`.

## 1) Security center (high-value missing feature)

React includes a dedicated **Security Settings** panel with:
- TOTP setup/confirm/disable flows.
- Recovery code generation and status.
- Device listing + per-device revoke.
- Security audit-log retrieval and display.

`app.html` currently has no corresponding security management UI/API flow.

## 2) Blocked users management (not just one-way blocking)

React supports:
- Requesting blocked list (`list_blocked`).
- Rendering blocked users from `blocked_list` events.
- Unblocking users (`unblock_contact`) and live state updates.

`app.html` handles blocking of inbound requests, but does not expose blocked-list browsing and unblocking workflow.

## 3) Contact/presence sync completeness

React socket handling includes event coverage for:
- `contacts_snapshot` initial population.
- `presence` updates.
- `contact_request`, `contact_request_sent`, `contact_accepted`, `contact_request_rejected`.
- `contact_blocked`, `contact_unblocked`, `blocked_list`.

`app.html` only handles a smaller subset in `handleServerEvent`, so parity is incomplete.

## 4) Message model correctness and server payload shape

React chat store sends typed message payloads (`text`, `winkd`, `nudge`) with IDs, ISO timestamps, and delivery/read flags via `send_message`.

`app.html` keeps mostly UI-local message objects and still uses local fake reply simulation for online contacts, so the data model is less production-grade.

## 5) Runtime resilience

React has an explicit app-level error boundary (`AppErrorBoundary`) that shows a user-facing fallback when render errors occur.

`app.html` lacks an equivalent crash-containment mechanism.

## Suggested backport order

1. Security settings (largest trust/safety gain).
2. Blocked-users list/unblock UX.
3. Full socket event parity (`contacts_snapshot`, `presence`, unblock/blocked-list).
4. Message object normalization to React/core schema.
5. Error boundary-like top-level fatal UI fallback.
