# Winkd Messenger — PWA

This folder is the complete Winkd Messenger Progressive Web App.

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire app — all HTML, CSS, and JS in one file |
| `manifest.json` | PWA manifest — name, icons, theme colour, display mode |
| `sw.js` | Service worker — offline caching, push notifications, background sync |
| `generate-icons.js` | Script to generate all icon sizes from a source PNG |
| `icons/` | Generated icon PNGs (create with generate-icons.js) |

## Getting icons

1. Download the Winkd icon: `https://i.imgur.com/kmVfSzn.png`
2. Save it as `icon-source.png` in this folder
3. Run: `npm install sharp && node generate-icons.js`
4. The `icons/` folder will be created with all 8 sizes

## Running locally

Any static file server works:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

Then open `http://localhost:8080` in Chrome or Edge.

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

## Service Worker features

- **Offline support** — app loads and works without internet after first visit
- **Cache-first** — assets served from cache instantly, updated in background
- **Background sync** — queued messages flush automatically when reconnected
- **Push notifications** — stub ready; wire to Winkd server push endpoint
- **Auto-update** — detects new versions and prompts user to refresh

## Deployment

Drop this entire folder on any static host:

- **Vercel** — `vercel --prod`
- **Netlify** — drag folder into Netlify dashboard
- **GitHub Pages** — push to a repo, enable Pages
- **Railway** — add a static site service pointing to this folder
- **Cloudflare Pages** — connect repo or upload directly

HTTPS is required for service workers and camera (QR scanner) to function.
The service worker will silently fail on HTTP — everything else still works.

## Tech notes

- Zero dependencies — no React, no bundler, no build step
- Single HTML file for easy deployment and iteration
- Manifest uses `purpose: "maskable any"` for proper Android adaptive icons
- `edge_side_panel` in manifest enables Edge sidebar panel mode
- Service worker uses stale-while-revalidate for assets, cache-first for navigation
