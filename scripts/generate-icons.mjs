// Generates every app icon from the Eboclean logo.
// Run: node scripts/generate-icons.mjs
// Output:
//   public/icons/icon-192.png, icon-512.png          PWA icons (rounded, "any")
//   public/icons/maskable-192.png, maskable-512.png  Android adaptive icons (full-bleed, safe zone)
//   src/app/apple-icon.png                           iPhone home screen (180, full-bleed, no transparency)
//   store-assets/play-store-icon-512.png             Google Play listing icon
//   store-assets/app-store-icon-1024.png             Apple App Store icon (no transparency)
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const BG = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>`;
const GLYPH = `
  <path d="M18 35 H44 M44 35 A13.5 13.5 0 1 0 40.5 45" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M49 8 C50 13.5 51 14.5 56.5 15.5 C51 16.5 50 17.5 49 23 C48 17.5 47 16.5 41.5 15.5 C47 14.5 48 13.5 49 8 Z" fill="#6ee7b7"/>`;

// Rounded app tile (for browsers / PWA "any" icons).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${BG}</defs><rect width="64" height="64" rx="18" fill="url(#g)"/>${GLYPH}</svg>`;

// Full-bleed square; the glyph is shrunk into the centre so OS masks (circle, squircle) never clip it.
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${BG}</defs><rect width="64" height="64" fill="url(#g)"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${GLYPH}</g></svg>`;

async function png(svg, size, file, flatten = false) {
  let img = sharp(Buffer.from(svg), { density: 600 }).resize(size, size);
  if (flatten) img = img.flatten({ background: "#6d5bf0" });
  await img.png().toFile(file);
  console.log("wrote", file);
}

await mkdir("public/icons", { recursive: true });
await mkdir("store-assets", { recursive: true });

await png(rounded, 192, "public/icons/icon-192.png");
await png(rounded, 512, "public/icons/icon-512.png");
await png(fullBleed(0.72), 192, "public/icons/maskable-192.png", true);
await png(fullBleed(0.72), 512, "public/icons/maskable-512.png", true);
await png(fullBleed(0.86), 180, "src/app/apple-icon.png", true);
await png(fullBleed(0.86), 512, "store-assets/play-store-icon-512.png", true);
await png(fullBleed(0.86), 1024, "store-assets/app-store-icon-1024.png", true);
