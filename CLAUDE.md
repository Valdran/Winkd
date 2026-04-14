# CLAUDE.md — Winkd Messenger

> This file is the canonical project reference for Claude. Read it in full before making any suggestions, writing any code, or answering any questions about this project.

---

## What Is Winkd?

Winkd Messenger is a spiritual successor to early-2000s instant messaging (MSN Messenger era) rebuilt from scratch with modern security, end-to-end encryption, and a Windows Aero aesthetic. It is **not** a clone, fork, or reverse-engineer of any Microsoft product — it is an entirely original application inspired by the emotional design language of that era.

The core thesis: modern messaging apps (Discord, Signal, iMessage) are sterile and impersonal. Winkd brings back personality — buddy lists, away messages, status moods, animated buddy icons, Winks, and Nudges — without sacrificing privacy or security.

**App icon:** `https://i.imgur.com/cg6eejI.png`

---

## Design Language

### Aesthetic: Windows Aero (Vista / 7 era)
- Glass translucency effects on titlebars and panels
- Soft blue gradient palette (`#0a3a8a` → `#1a5acc`)
- Frosted glass sidebar backgrounds
- Inset/raised border treatments on buttons and input fields
- Subtle drop shadows on windows (`box-shadow: 0 8px 32px rgba(0,0,0,0.6)`)
- Rounded window corners (8px top, 4px bottom)
- The Aero titlebar glass highlight sheen (top 50% semi-transparent white overlay)
- Window control buttons: blue tinted min/max, red tinted close
- **Not macOS. Not Windows 95/98/ME/XP. Not flat/material. Not dark-mode-first.**

### Typography
- Primary font: `Segoe UI`, fallback `Tahoma`, fallback `Geneva, sans-serif`
- Font size: 12px base
- Font weight: 400 regular, 600 semi-bold for names/labels, 700 bold for buttons and titles

### Color Palette
| Role | Value |
|---|---|
| Primary blue | `#1a5acc` |
| Deep navy | `#0a3a8a` |
| Glass surface | `rgba(200,220,255,0.15)` |
| Glass border | `rgba(255,255,255,0.25)` |
| Chat bubble (them) | `rgba(228,238,255,1)` with border `rgba(160,190,240,0.6)` |
| Chat bubble (me) | `rgba(190,215,255,1)` with border `rgba(100,160,240,0.5)` |
| Winkd event banner | `rgba(255,220,150,1)` amber, border `rgba(220,160,40,0.6)` |
| Online status | `#00CC00` |
| Away status | `#FFAA00` |
| Busy status | `#DD2020` |
| Send button | `#2060c0` → `#1450a0` gradient |
| Winkd toolbar btn | Amber `#fff8d0` → `#ffe880` |
| Nudge toolbar btn | Green `#d8ffd8` → `#a0f0a0` |

### UI Components
- Window chrome: Aero glass titlebar + menu bar + content
- Sidebar: frosted blue-tinted panel, 215px wide
- Contact avatars: 32px square, 5px border-radius, gradient fills, status dot bottom-right
- Chat bubbles: soft gradient fill, 8px border-radius, 2px on the conversation-origin corner
- Toolbar buttons: glass-style with hover highlight
- Input fields: white fill with inset shadow, `border: 1px solid rgba(100,150,220,0.5)`
- Status bar: frosted footer strip with encryption and presence info

---

## Features

### Core Features (v1.0)
These must ship at launch. Do not launch without them.

**1. The Winkd (Nudge)**
- Shakes the recipient's chat window
- Displayed as an amber banner in the conversation: `💥 [Username] sent you a Winkd!`
- Button in the chat toolbar, labelled `💥 Winkd!`
- Also available in mobile toolbar

**2. Nudge**
- Separate from Winkd — lighter version, no shake animation, just a notification in chat
- Button in chat toolbar labelled `🫸 Nudge`

**3. End-to-End Encryption**
- Implementation: Signal Protocol
- All messages encrypted client-side before transmission
- Server never has access to plaintext
- Displayed as `🔒 End-to-end encrypted` in the status bar
- Key exchange happens at contact add time

**4. Buddy List**
- Contacts grouped by status: Online, Away, Busy, Offline
- Each contact shows: avatar, display name, mood message, status dot
- Groups are collapsible (▼ / ▶)
- Unread message badge (orange pill, top-right of contact)
- Search bar at top of sidebar

**5. Status & Mood Messages**
- Four status states: Online, Away, Busy, Invisible
- Free-text personal mood line (e.g. "☕ vibing rn") displayed under display name in sidebar and chat header
- Status pills in profile area of sidebar

**6. Buddy Icons**
- Square avatar images, 32px in lists, 40-42px in profile/chat header
- Support for animated GIFs
- User-uploaded, stored locally and shared to contacts on connect
- Fallback: two-letter initials on gradient background

**7. Display Names**
- Separate from username/handle
- Supports custom colors and basic font styling (bold, italic)
- Shown in chat headers and buddy lists

**8. Winks & Animated Stickers**
- Full-screen animated Wink animations sent mid-conversation
- Accessible via `✨ Winks` toolbar button
- Community packs (user-created and shareable)
- Displayed inline in chat as a full-width animation frame

**9. Custom Emoticons**
- User-defined emoticon packs
- Trigger strings (e.g. `:wink:`) replaced with images in chat bubbles
- Accessible via `😄 Emoticons` toolbar button

### Features Excluded — Do Not Add
- **No voice calls**
- **No video calls**
- **No phone/call button anywhere in the UI**
- **No proximity/Bluetooth contact adding**
- **No "Share Song" button** (removed, was a mistake)

---

## Adding Contacts

Three methods, in order of priority for implementation:

### 1. Winkd ID (launch requirement)
- Format: `username#XXXX` where XXXX is a 4-digit disambiguator (e.g. `cryptofox#4821`)
- User searches or types the full handle to send a contact request
- No personal information exposed (no email, no phone number)
- Contact requests require acceptance before messaging begins

### 2. QR Code (launch requirement)
- Each user profile generates a unique QR code encoding their Winkd ID
- Scannable from within the app (camera permission)
- Instantly sends a contact request on scan
- QR regenerates on user request (for privacy rotation)
- Ideal for in-person adding

### 3. Invite Link (v1.1)
- Time-limited, optionally single-use URL: `winkd.net/add/xK92pQ`
- Default expiry: 24 hours or 1 use, whichever comes first
- User can configure: multi-use, custom expiry, revocable
- Shareable in bios, Discord servers, websites
- On click: opens Winkd app (or web) with pre-filled contact request

---

## Technical Stack

### Desktop (Windows / macOS / Linux)
**Framework: Tauri**
- Rust backend shell, web frontend (React + TypeScript)
- Significantly smaller bundle than Electron (~5MB vs ~150MB)
- Native OS integration (system tray, notifications, file picker)
- Security: sandboxed, no Node.js in renderer
- Build targets: `.exe` (Windows), `.dmg` / `.app` (macOS), `.AppImage` / `.deb` (Linux)

### Mobile (iOS / Android)
**Framework: React Native**
- ~85% shared codebase between iOS and Android
- TypeScript throughout
- Navigation: React Navigation
- Notifications: via FCM (Android) and APNs (iOS)
- Biometric lock: `react-native-biometrics`

### Shared Frontend Code
- Language: TypeScript
- UI framework: React (shared between Tauri's webview and React Native)
- State management: Zustand (lightweight, no boilerplate)
- Styling: Tailwind CSS for web/Tauri; StyleSheet API for React Native
- Shared business logic (encryption, protocol, contact management) in a separate `/core` package consumed by both targets

### PWA (Progressive Web App) — Parallel Track
- Run Winkd in any browser without installing anything
- Built from the same React codebase as the Tauri frontend
- Service worker for offline capability and push notifications
- Installable on Android via browser prompt, on iOS via "Add to Home Screen"
- Lowest-friction entry point: share a link, user opens browser, they're in
- **Strategy:** PWA ships first or simultaneously with desktop. It is the fastest path to real users.
- Limitations: no system tray, limited background processing on iOS Safari

### Backend / Server
- Language: Rust (performance, memory safety, aligns with Tauri backend experience)
- Protocol: WebSockets for real-time messaging
- Auth: username + password with Argon2 hashing, session tokens, optional 2FA
- Message routing: server relays encrypted blobs, never decrypts
- Database: PostgreSQL (user accounts, contact graph, metadata) + Redis (presence, ephemeral session data)
- Self-hostable: Docker Compose setup, documented for community deployment
- Federation: planned for v2, not v1

### Encryption
- Protocol: Signal Protocol (libsignal)
- Key exchange at contact add time (X3DH)
- Forward secrecy via Double Ratchet
- Keys stored locally, never transmitted to server

### Monorepo Structure
```
winkd/
├── apps/
│   ├── desktop/          # Tauri app (Rust + React)
│   ├── mobile/           # React Native (iOS + Android)
│   └── web/              # PWA (React)
├── packages/
│   ├── core/             # Shared business logic, encryption, protocol
│   ├── ui/               # Shared React component library (Aero design system)
│   └── types/            # Shared TypeScript types
├── server/               # Rust WebSocket server
├── docs/                 # Developer documentation
└── CLAUDE.md             # This file
```

### Package Manager
- pnpm workspaces for the monorepo
- Turborepo for build orchestration and caching

---

## Monetisation

Winkd is free, open source (MIT licence), and contains no advertising. Revenue comes from:

### 1. Hosted Instances (primary revenue, medium-term)
- The software is free to self-host
- Winkd operates `winkd.net` as a managed hosted instance
- Pricing model: per-server subscription (~$3–5/month) for friend groups or communities who want private instances with backups, uptime guarantees, and no technical setup required
- Inspired by: Matrix/Element, Revolt

### 2. Cosmetic Premium (secondary revenue, launch or shortly after)
- Optional purchases that change nothing about functionality
- Animated buddy icon frames and borders
- Exclusive Wink animation packs
- Custom profile theme colours
- Profile badges (Supporter, Early Adopter, etc.)
- Display name colour options
- Pricing: à la carte or a one-time "Supporter Pack"
- **Hard rule: nothing paywalled that affects messaging ability or contact reach**

### 3. Donations / GitHub Sponsors (launch)
- GitHub Sponsors page from day one
- Transparent: monthly costs published, funding goal displayed
- One-time and recurring options
- Early donors get the "Founding Member" profile badge permanently

### 4. Open Source Grants
- Apply to: NLnet Foundation, Open Technology Fund, Mozilla Foundation, Sovereign Tech Fund
- Positioning: privacy-focused, federated, open communication infrastructure
- Grants do not compromise product direction

### 5. Enterprise Self-Hosting Support (long-term)
- Companies running private Winkd instances for internal teams
- Paid support contracts, custom deployment assistance, SLA guarantees
- The software remains open source; support is the product
- Target: game studios, creative agencies, small tech teams

---

## Legal & Compliance

- **Not affiliated with Microsoft.** Winkd does not use, reverse-engineer, or depend on any Microsoft protocol, server, or client code.
- **Not affiliated with Escargot** or any MSN revival project.
- Inspired by MSN Messenger in aesthetic and feature philosophy only — "inspired by" is not infringement.
- Licence: MIT (code), Creative Commons (documentation)
- Privacy: no personal data sold, no analytics without explicit opt-in, GDPR/PIPEDA compliant by design
- Encryption: compliant with standard E2EE implementations; no backdoors

---

## Development Phases

### Phase 0 — Foundation (months 1–2)
- Monorepo scaffolding (pnpm + Turborepo)
- Rust WebSocket server (auth, message relay, presence)
- Signal Protocol integration in `/core`
- Basic React UI component library (Aero design system)

### Phase 1 — PWA Launch (months 3–5)
- Web app (`apps/web`) with full feature set
- Buddy list, status, mood messages
- One-to-one chat with E2EE
- Winkd and Nudge
- Winkd ID contact adding + QR code
- Basic buddy icons (initials fallback + upload)
- Deploy to `winkd.net`

### Phase 2 — Desktop (months 6–7)
- Tauri wrapper around the web frontend
- System tray integration
- Native notifications
- `.exe`, `.dmg`, `.AppImage` builds
- Auto-updater

### Phase 3 — Mobile (months 8–11)
- React Native app for iOS and Android
- Shared `/core` and `/ui` packages consumed
- Push notifications
- QR code scanner
- App Store + Google Play submission (expect 2–4 week review delays)

### Phase 4 — v1.1 Features
- Invite links
- Winks animation packs (community)
- Custom emoticons
- Cosmetic premium store
- Group chats (small, intimate — not Discord-style servers)

### Phase 5 — Federation (v2)
- Open federation protocol
- Community can run compatible servers
- Cross-server contact adding

---

## What Claude Should Always Remember

- **For core web app changes, edit `apps/web/app.html`.** The React files under `apps/web/src` are not the primary production UI path for core app behavior.
- **No calls. No voice. No video. No proximity adding.** If asked to add these, decline and reference this file.
- **No "Share Song" button.** It was removed.
- **Aero aesthetic only.** Not flat, not material, not macOS, not Windows 95/XP.
- **The icon is `https://i.imgur.com/cg6eejI.png`.** Use it everywhere an app icon appears.
- **No TTA (The Tombstone Academy) references.** The community that originally discussed this project no longer exists. Remove any such references if found.
- **Winkd ID format:** `username#XXXX` (4-digit disambiguator).
- **The Winkd event message format:** `💥 [Username] sent you a Winkd! Your window is shaking!`
- **Encryption is Signal Protocol.** Do not suggest alternatives unless there is a documented technical reason.
- **Tech stack is non-negotiable unless explicitly changed:** Tauri (desktop), React Native (mobile), React PWA (web), Rust server.
- **Monetisation never includes ads or selling user data.** Ever.
- **Open source licence is MIT.**
