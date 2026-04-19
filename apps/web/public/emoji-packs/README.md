# Winkd Emoji Packs

Each subdirectory here is one emoji pack. The folder name is the pack's
**SKU** — it must match exactly what appears in the BMAC extra's `extra_id`
(or `sku`) field, since that's how the server maps a purchase to the right
pack on the user's account.

## Folder layout

```
emoji-packs/
  <pack-id>/
    manifest.json       ← describes the pack and lists every emoji
    <slug>.png          ← individual emoji images (PNG, ≤ 256×256 px)
    <slug>.gif          ← animated variants (GIF)
```

## manifest.json schema

```json
{
  "id":          "spikey",
  "name":        "Spikey",
  "description": "...",
  "version":     "1.0.0",
  "price_cad":   3.99,
  "sku":         "emoji-pack-spikey",
  "author":      "Winkd",
  "preview":     "spikey-happy.png",
  "emojis": [
    {
      "slug":    "spikey-happy",
      "label":   "Happy Spikey",
      "trigger": ":spikey-happy:",
      "file":    "spikey-happy.png",
      "animated": false
    }
  ]
}
```

## Image guidelines

| Property | Spec |
|---|---|
| Format | PNG (static) or GIF (animated) |
| Canvas | 256 × 256 px, transparent background |
| Display size | 28 × 28 px in chat, 18 × 18 px inline |
| File size | ≤ 200 KB per image; ≤ 1 MB per animated GIF |
| Colour space | sRGB |

Name each file exactly after its `slug` value in manifest.json.
Drop images here and update `emojis[]` in manifest.json — the app will pick
them up on next build/reload.

## How packs appear in the app

1. The client fetches `/emoji-packs/<pack-id>/manifest.json` at load time
   for every pack id that appears in the user's `purchased_extras` list
   (delivered by the server in the `auth_ok` WebSocket frame).
2. The emoji picker adds a new tab for each loaded pack, with the pack's
   name as the tab label.
3. Trigger strings (e.g. `:spikey-happy:`) in outbound messages are
   replaced inline before display.
