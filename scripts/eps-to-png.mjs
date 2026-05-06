#!/usr/bin/env node
// Extract the embedded TIFF preview from a DOS-EPS file and render the brand
// wordmark in three forms across all SPAs:
//
//   1. Dark wordmark on transparent  — black H-D CERTIFIED + orange dash
//                                      (good for white pills / light bg)
//   2. Light wordmark on transparent — white H-D CERTIFIED + orange dash
//                                      (used directly on the dark site header)
//   3. Favicons — 16, 32, 48, 192, 512 squares from the dark variant
//
// DOS EPS format (Adobe TN5002):
//   bytes 0-3    : magic 0xC5D0D3C6 (little-endian)
//   bytes 20-23  : TIFF preview offset
//   bytes 24-27  : TIFF preview length
//
// We slice the embedded TIFF and feed it to Sharp. Adobe Illustrator's TIFF
// previews violate strict spec (out-of-order tags), so failOn is relaxed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');

const epsPath = path.resolve(repo, '../Assets/hdcertified_prod-wordmark-hd_rgb_0221.eps');
const buf = readFileSync(epsPath);

const magic = buf.readUInt32LE(0);
if (magic !== 0xc6d3d0c5) throw new Error(`Not a DOS EPS file (magic 0x${magic.toString(16)})`);
const tiffOffset = buf.readUInt32LE(20);
const tiffLength = buf.readUInt32LE(24);
if (tiffOffset === 0 || tiffLength === 0) {
  throw new Error('EPS has no TIFF preview — cannot rasterize without Ghostscript.');
}
const tiff = buf.subarray(tiffOffset, tiffOffset + tiffLength);
const sharpOpts = { failOn: 'truncated' };

const meta = await sharp(tiff, sharpOpts).metadata();
console.log(`TIFF preview: ${meta.width}×${meta.height}, ${meta.channels} ch`);

// ─── Variant A: dark wordmark on transparent ───────────────────────
// Source TIFF has a white background. We replace near-white with transparent
// and keep everything else (black glyphs, orange dash) as-is.
async function makeDarkTransparent(width) {
  // Decode once at native size into raw RGBA, then composite on transparent.
  // Sharp's `extract` + `unflatten` approach: use linear flattening with a
  // precise color match isn't built-in, so we go the raw-pixel route.
  const { data, info } = await sharp(tiff, sharpOpts)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Treat near-white pixels (all channels ≥ 245) as transparent.
    if (r >= 245 && g >= 245 && b >= 245) {
      out[i + 3] = 0; // alpha
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({ width, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ─── Variant B: light wordmark on transparent ──────────────────────
// Inverts black/grey ink → white while preserving the orange dash + ™.
// Anti-aliased edges keep their soft falloff via luminance-derived alpha:
// a 50%-grey edge pixel becomes white at 50% alpha, so glyph contours stay
// smooth instead of jagged.
async function makeLightTransparent(width) {
  const { data, info } = await sharp(tiff, sharpOpts)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const isOrange = (r, g, b) => r > 200 && b < 120 && r > b + 60;
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (isOrange(r, g, b)) {
      // Keep brand-orange pixels as-is, fully opaque.
      out[i + 3] = 255;
      continue;
    }
    // Greyscale ink → solid white, alpha = darkness.
    // Luminance close to white → low alpha (background fades out).
    // Luminance close to black → full alpha (solid white glyph).
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const alpha = Math.max(0, Math.min(255, Math.round(255 - lum)));
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = alpha;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({ width, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const TARGETS = [
  { name: 'hd-certified-wordmark.png', width: 430, variant: 'dark' },
  { name: 'hd-certified-wordmark@2x.png', width: 860, variant: 'dark' },
  { name: 'hd-certified-wordmark@3x.png', width: 1290, variant: 'dark' },
  { name: 'hd-certified-wordmark-light.png', width: 430, variant: 'light' },
  { name: 'hd-certified-wordmark-light@2x.png', width: 860, variant: 'light' },
  { name: 'hd-certified-wordmark-light@3x.png', width: 1290, variant: 'light' },
];

const APP_DIRS = [
  'apps/web-buyer/public/brand',
  'apps/web-dealer/public/brand',
  'apps/web-admin/public/brand',
];

for (const dir of APP_DIRS) {
  const abs = path.join(repo, dir);
  mkdirSync(abs, { recursive: true });
  for (const t of TARGETS) {
    const png = t.variant === 'dark'
      ? await makeDarkTransparent(t.width)
      : await makeLightTransparent(t.width);
    writeFileSync(path.join(abs, t.name), png);
    console.log(`  ${dir}/${t.name} (${png.byteLength.toLocaleString()} bytes)`);
  }
}

// ─── Favicons ──────────────────────────────────────────────────────
// "H-D" text on a brand-orange tile, rendered from inline SVG so it stays
// crisp at every size. The wordmark is too long/thin to read at 16/32 px,
// so we use a self-contained mark instead.
const FAVICON_SVG_FOR = (size) => {
  const fontPx = Math.round(size * 0.42);
  const dashY = Math.round(size * 0.55);
  const dashH = Math.max(2, Math.round(size * 0.06));
  const dashX = Math.round(size * 0.42);
  const dashW = Math.round(size * 0.16);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#FF6600"/>
  <text x="50%" y="62%" text-anchor="middle"
        font-family="Arial Black, Helvetica, sans-serif" font-weight="900"
        font-size="${fontPx}" fill="#fff" letter-spacing="-1">H D</text>
  <rect x="${dashX}" y="${dashY - Math.round(dashH / 2)}"
        width="${dashW}" height="${dashH}" fill="#fff"/>
</svg>`;
};
async function makeFavicon(size) {
  return sharp(Buffer.from(FAVICON_SVG_FOR(size)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const FAVICON_SIZES = [16, 32, 48, 64, 192, 512];
for (const dir of APP_DIRS) {
  const abs = path.join(repo, dir.replace('/brand', ''));
  for (const size of FAVICON_SIZES) {
    const png = await makeFavicon(size);
    const name = size === 32 ? 'favicon.png' : `favicon-${size}.png`;
    writeFileSync(path.join(abs, name), png);
    console.log(`  ${dir.replace('/brand', '')}/${name} (${png.byteLength.toLocaleString()} bytes)`);
  }
  // Also write favicon.svg — same composition as the rendered PNGs.
  const svg = FAVICON_SVG_FOR(64);
  const target = path.join(repo, dir.replace('/brand', ''), 'favicon.svg');
  writeFileSync(target, svg);
  console.log(`  ${dir.replace('/brand', '')}/favicon.svg (${svg.length.toLocaleString()} bytes)`);
}

console.log('\nDone. Reference these from your components as /brand/hd-certified-wordmark[-light][@2x|@3x].png');
