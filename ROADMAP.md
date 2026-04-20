# Winkd Messenger — Project Roadmap

> Last updated: April 2026. Tracks what has shipped, what is in progress, and what is coming.

> Process rule (effective April 20, 2026): every pull request must update this roadmap to reflect any feature, status, or scope changes before merge.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped / fully implemented |
| 🔧 | Scaffolded — infrastructure exists, feature incomplete |
| 🔲 | Planned — not yet started |
| ❌ | Explicitly out of scope — will not be added |

---

## Phase 0 — Foundation ✅ Complete

Core infrastructure. Everything else is built on top of this.

| Feature | Status | Notes |
|---------|--------|-------|
| Monorepo scaffolding (pnpm + Turborepo) | ✅ | `apps/`, `packages/`, `server/` structure in place |
| Shared TypeScript types package (`packages/types`) | ✅ | Consumed by web app and core |
| Shared UI component library (`packages/ui`) | ✅ | Avatar, ChatBubble, StatusPill, design tokens |
| Shared core logic package (`packages/core`) | ✅ | Encryption, protocol client, contact management |
| Rust WebSocket server (Axum) | ✅ | Auth, message relay, presence |
| PostgreSQL database with migrations | ✅ | 12 migration files; full schema |
| Redis presence store | ✅ | Ephemeral online/offline state |
| Docker Compose setup | ✅ | Single-command local dev and deployment |
| Signal Protocol integration in `/core` | ✅ | X3DH + Double Ratchet, AES-256-GCM, ECDH-P256 |
| Aero design system tokens | ✅ | Colors, typography, spacing defined in `packages/ui/src/tokens` |

---

## Phase 1 — PWA Launch ✅ Complete

The web app as a fully functional instant messenger.

### Authentication & Security

| Feature | Status | Notes |
|---------|--------|-------|
| Username + password registration | ✅ | Argon2id (128MB, 4 iterations) |
| Login with session tokens | ✅ | 256-bit random tokens, 30-day expiry, never in URLs |
| OAuth login (12 providers) | ✅ | Discord, Google, GitHub, Microsoft, Facebook, X, Twitch, Reddit, Spotify, LinkedIn, Apple, Steam |
| Two-factor authentication (TOTP) | ✅ | RFC 6238/4226 compliant; backup recovery codes |
| Multi-device session management | ✅ | Device list, per-device revocation |
| Password reset flow | ✅ | Email-based request (SMTP integration needed — see gaps) |
| Rate limiting | ✅ | 10 attempts/min login, 5/min register |
| Audit logging | ✅ | Security events logged server-side |

### Messaging

| Feature | Status | Notes |
|---------|--------|-------|
| One-to-one text chat | ✅ | Full send/receive with history |
| End-to-end encryption | ✅ | Signal Protocol; server never sees plaintext |
| Safety numbers (key fingerprints) | ✅ | 60-digit SHA-512 fingerprints for manual verification |
| Forward secrecy | ✅ | Keys rotate per message via Double Ratchet |
| Out-of-order message delivery | ✅ | 500-message skipped key cache |
| URL detection and link rendering | ✅ | Auto-linked in chat bubbles |
| Inline image embeds | ✅ | Auto-detects .gif, .webp, .png, .jpg, .jpeg URLs |
| Message delivery tracking | ✅ | Delivered/read flags |
| WebSocket real-time transport | ✅ | First-frame auth, 5s auth timeout, 4001 session invalidation |
| Auto-reconnect on disconnect | ✅ | Except on 4001 Unauthorized |

### The Winkd & Nudge

| Feature | Status | Notes |
|---------|--------|-------|
| 💥 Winkd button in toolbar | ✅ | Sends shake event to recipient |
| Recipient window shake animation | ✅ | CSS keyframe animation on receive |
| Amber banner in chat (`💥 [User] sent you a Winkd!`) | ✅ | Displayed inline as a system event |
| 🫸 Nudge button in toolbar | ✅ | Lightweight notification, no shake |

### Buddy List & Contacts

| Feature | Status | Notes |
|---------|--------|-------|
| Contact requests (send/accept/reject) | ✅ | Winkd ID format: `username#XXXX` |
| Block / unblock contacts | ✅ | Blocked users list with management UI |
| Contacts grouped by status | ✅ | Online, Away+Busy, Offline groups |
| Collapsible groups | ✅ | ▼ / ▶ toggle |
| Unread message badges | ✅ | Orange pill, per-contact count |
| Contact search bar | ✅ | Filters by display name in real time |
| Pending invitations modal | ✅ | Inbound requests with accept/reject |
| QR code contact adding | 🔧 | QR code generation + payload parsing flow added in Add Contact modal; camera scanning + rotation still pending |

### User Profile & Status

| Feature | Status | Notes |
|---------|--------|-------|
| Display name | ✅ | Editable, shown in buddy list and chat header |
| Mood message | ✅ | Free-text, max 100 chars, editable in sidebar |
| Four status states (Online/Away/Busy/Invisible) | ✅ | Click-to-cycle in sidebar profile area |
| Status dot on contact avatars | ✅ | Colored dot bottom-right of avatar |
| Winkd ID (`username#XXXX`) | ✅ | 4-digit discriminator |
| Buddy icon (avatar) | ✅ | Base64-encoded image; initials+gradient fallback |
| Animated GIF avatars | 🔲 | Fallback renders correctly; GIF animation not verified end-to-end |

### UI & Polish

| Feature | Status | Notes |
|---------|--------|-------|
| Windows Aero glass aesthetic | ✅ | Titlebars, frosted sidebar, drop shadows, gradients |
| Segoe UI typography | ✅ | With Tahoma/Geneva fallbacks |
| Emoji picker | ✅ | Custom spikey emoji pack in `apps/web/public` |
| PWA manifest + service worker | ✅ | Offline capability, installable on Android/iOS |
| Responsive layout | ✅ | Flexbox, sidebar + chat main area |
| Modal dialogs | ✅ | Add contact, pending invites, blocked users, security |
| `🔒 End-to-end encrypted` status bar indicator | ✅ | Shown in footer strip |

### Backend Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Pre-key bundle upload and consumption | ✅ | One-time pre-keys, server-tracked |
| Pending message queue | ✅ | Offline queue + reconnect drain + sender delivery receipts implemented |
| Presence broadcasts to contacts | ✅ | Real-time via WebSocket |
| Supporter/premium tier system | ✅ | Free vs Plus; buddy slot limits; group chat flag |
| Buy Me a Coffee integration | ✅ | BMAC URLs for purchase/renewal |

---

## Phase 2 — Desktop App 🔲 Not Started

Tauri wrapper around the existing web frontend.

| Feature | Status | Notes |
|---------|--------|-------|
| Tauri shell (Rust backend + webview) | 🔲 | `apps/desktop/` directory not yet created |
| System tray integration | 🔲 | |
| Native OS notifications | 🔲 | |
| Windows `.exe` build | 🔲 | |
| macOS `.dmg` / `.app` build | 🔲 | |
| Linux `.AppImage` / `.deb` build | 🔲 | |
| Auto-updater | 🔲 | |

---

## Phase 3 — Mobile App 🔲 Not Started

React Native app for iOS and Android.

| Feature | Status | Notes |
|---------|--------|-------|
| React Native project scaffolding (`apps/mobile/`) | 🔲 | |
| iOS app | 🔲 | |
| Android app | 🔲 | |
| Push notifications (FCM + APNs) | 🔲 | |
| QR code scanner for contact adding | 🔲 | |
| Biometric lock (`react-native-biometrics`) | 🔲 | |
| App Store submission | 🔲 | Expect 2–4 week review |
| Google Play submission | 🔲 | |

---

## Phase 4 — v1.1 Features 🔲 Planned

Quality-of-life additions post-launch.

| Feature | Status | Notes |
|---------|--------|-------|
| Wink animation packs (✨ Winks) | 🔧 | Button exists in toolbar; handler stubbed as `/* Phase 4 */` |
| Custom emoticon packs | 🔧 | Emoji picker built; custom emoticon upload/rendering not coded |
| Group chat | 🔧 | Plus-tier flag exists; UI and routing not implemented |
| Invite links (`winkd.net/add/xK92pQ`) | 🔲 | Time-limited, optionally single-use |
| Cosmetic premium store | 🔲 | Animated icon frames, Wink packs, theme colours, badges |
| Typing indicators | 🔲 | |
| Message editing and deletion | 🔲 | |
| Message search | 🔲 | No search UI or backend indexing yet |
| Offline message queuing (complete) | ✅ | Delivery path is complete with reconnect replay + sender delivery receipts |
| Animated GIF avatar verification | 🔲 | Infrastructure present; needs end-to-end test |
| QR code contact adding (web) | 🔧 | Add Contact modal supports personal QR + payload parse flow; camera scanner still pending |

---

## Roadmap Maintenance Rule

- Every PR **must** include any required updates to `ROADMAP.md` before merge.
- If a PR changes scope, status, delivery confidence, or introduces/removes features, the roadmap must be updated in the same PR.
- If no roadmap line changes are needed, the PR description should explicitly state that it was reviewed and no roadmap update was required.

---

## Phase 5 — Federation (v2) 🔲 Future

Open federation so the community can run compatible servers.

| Feature | Status | Notes |
|---------|--------|-------|
| Federation protocol design | 🔲 | |
| Cross-server contact adding | 🔲 | |
| Community server directory | 🔲 | |

---

## Known Gaps (No Phase Assigned)

These are infrastructure or operational items not tied to a specific feature phase.

| Gap | Notes |
|----|-------|
| SMTP / transactional email | Password reset flow references email but no SMTP service is wired up |
| Key management UI | Signal Protocol keys are generated in `/core` but there is no user-facing key management screen |
| Admin dashboard | No moderation or administrative tooling |
| CDN / static asset caching | No CDN layer in front of static assets |
| API documentation | No public API docs or client SDK |

---

## Explicitly Out of Scope

These will not be added to Winkd. Ever.

| Feature | Reason |
|---------|--------|
| ❌ Voice calls | Not part of the product vision |
| ❌ Video calls | Not part of the product vision |
| ❌ Phone/call button | Not part of the product vision |
| ❌ Proximity / Bluetooth contact adding | Removed from design |
| ❌ "Share Song" button | Removed; was a mistake |
| ❌ Advertising | Monetisation never includes ads |
| ❌ Selling user data | Against the product's core values |
| ❌ Paywalled messaging features | Hard rule: nothing that affects messaging ability is paywalled |
