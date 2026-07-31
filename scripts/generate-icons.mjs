/**
 * Generates the PWA icon set.  Run: `npm run icons`
 *
 * PLACEHOLDER MARK (Phase 0 decision 3). A geometric italic "N" — the shape of
 * Barlow Condensed 800 italic, drawn as a path rather than set as text, because
 * SVG text rasterisation depends on fonts installed on the build machine and
 * Barlow is not one of them. Swap in real artwork by replacing `mark()` below
 * and re-running; nothing else changes, the manifest already points here.
 *
 * The two hex values are a necessary exception to "hex lives only in
 * globals.css" — a PNG cannot reference a CSS variable. They mirror --bg and
 * --blue and must be changed together with them.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BG = "#0d0f14"; // mirrors --bg
const BLUE = "#0066ff"; // mirrors --blue

const ITALIC_SLANT = 12; // degrees, matching the display face's lean
const ICONS_DIR = path.join(process.cwd(), "public", "icons");

/** The N, in a 100x100 local space: two stems joined by a diagonal. */
const N_PATH =
  "M0,100 L0,0 L26,0 L74,62 L74,0 L100,0 L100,100 L74,100 L26,38 L26,100 Z";

/**
 * @param {number} size      pixel dimensions of the square canvas
 * @param {number} radius    corner radius in 0-100 user units (0 = full bleed)
 * @param {number} markScale mark height as a percentage of the canvas
 */
function icon(size, radius, markScale) {
  const s = markScale / 100;
  const slant = Math.tan((ITALIC_SLANT * Math.PI) / 180);

  // Skewing widens the glyph's bounding box to the left; recentre on it.
  const skewedWidth = 100 + slant * 100;
  const tx = 50 - (skewedWidth / 2 - slant * 100) * s;
  const ty = 50 - 50 * s;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s}) skewX(-${ITALIC_SLANT})">
    <path d="${N_PATH}" fill="${BLUE}"/>
  </g>
</svg>`;
}

/* radius 0 and a smaller mark on the maskable variant: Android crops it to an
 * arbitrary shape, so everything must sit inside the central 80% safe zone. */
const TARGETS = [
  { file: "public/icons/icon-192.png", size: 192, radius: 22, mark: 52 },
  { file: "public/icons/icon-512.png", size: 512, radius: 22, mark: 52 },
  { file: "public/icons/icon-maskable-512.png", size: 512, radius: 0, mark: 44 },
  { file: "public/icons/apple-touch-icon.png", size: 180, radius: 0, mark: 52 },
  // Next.js serves app/icon.png as the favicon automatically.
  { file: "app/icon.png", size: 512, radius: 22, mark: 52 },
];

await mkdir(ICONS_DIR, { recursive: true });

for (const { file, size, radius, mark } of TARGETS) {
  const svg = icon(size, radius, mark);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(process.cwd(), file), png);
  console.log(`  ${file}  ${size}x${size}`);
}

console.log("\nIcons generated.");
