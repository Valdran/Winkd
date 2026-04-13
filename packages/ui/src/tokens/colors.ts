// ── Aero Design Tokens — Color Palette ──
// Single source of truth for all Winkd colours.
// Mirrors the palette defined in CLAUDE.md.

export const colors = {
  // Brand blues
  primaryBlue: "#1a5acc",
  deepNavy: "#0a3a8a",

  // Glass surfaces
  glassSurface: "rgba(200,220,255,0.15)",
  glassBorder: "rgba(255,255,255,0.25)",

  // Status indicators
  online: "#00CC00",
  away: "#FFAA00",
  busy: "#DD2020",
  offline: "#AAAAAA",

  // Chat bubbles
  bubbleThem: "rgba(228,238,255,1)",
  bubbleThemBorder: "rgba(160,190,240,0.6)",
  bubbleMe: "rgba(190,215,255,1)",
  bubbleMeBorder: "rgba(100,160,240,0.5)",

  // Winkd / Nudge event banners
  winkdBanner: "rgba(255,220,150,1)",
  winkdBannerBorder: "rgba(220,160,40,0.6)",

  // Buttons
  sendButtonFrom: "#2060c0",
  sendButtonTo: "#1450a0",
  winkdBtnFrom: "#fff8d0",
  winkdBtnTo: "#ffe880",
  nudgeBtnFrom: "#d8ffd8",
  nudgeBtnTo: "#a0f0a0",

  // Text
  textDark: "#1a2a40",
  textMuted: "#5a7a9a",
  textWhite: "#ffffff",
  textGhost: "rgba(220,238,255,0.75)",
} as const;

export type ColorToken = keyof typeof colors;
