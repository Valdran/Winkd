#!/usr/bin/env node
// generate-icons.js
// Run this once to generate all PWA icon sizes from the source image.
// Usage: node generate-icons.js
//
// Requires: npm install sharp
// Then place your source image as icon-source.png in this directory.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SOURCE = path.join(__dirname, 'icon-source.png');
const OUT_DIR = path.join(__dirname, 'icons');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (!fs.existsSync(SOURCE)) {
  console.error('❌ icon-source.png not found.');
  console.log('→ Download https://i.imgur.com/cg6eejI.png, save it as icon-source.png, then re-run.');
  process.exit(1);
}

(async () => {
  for (const size of SIZES) {
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 26, g: 58, b: 92, alpha: 1 } })
      .png()
      .toFile(out);
    console.log(`✅ icons/icon-${size}.png`);
  }
  console.log('\n🎉 All icons generated. Drop the icons/ folder next to index.html.');
})();
