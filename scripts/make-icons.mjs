// Generates the app icons from the word رفيق (Traditional Arabic, bold) so the
// home-screen icon is the app's name. The word is rendered, trimmed to its
// exact shape, then centred with the padding each platform needs.
//
//   node scripts/make-icons.mjs
import sharp from "sharp";

const GREEN = "#2f5d50";
const CREAM = "#f7f5f0";
const GOLD = "#c9a45c";
const OUT = "app/public";

/** The word as a tightly cropped transparent PNG, `width` px wide. */
async function word(width) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400">
    <text x="1000" y="900" font-family="Traditional Arabic" font-weight="700" font-size="900" fill="${CREAM}" text-anchor="middle">رفيق</text>
  </svg>`;
  const trimmed = await sharp(Buffer.from(svg)).png().trim({ threshold: 1 }).toBuffer();
  return sharp(trimmed).resize({ width }).png().toBuffer();
}

/**
 * Square icon. `scale` is the word's width as a share of the icon; maskable
 * icons keep everything inside the central 80% circle, so they use less.
 */
async function icon(size, scale, { radius = 0, flatten = false } = {}) {
  const w = await word(Math.round(size * scale));
  const { width: ww, height: wh } = await sharp(w).metadata();
  const bar = { w: Math.round(ww * 0.34), h: Math.max(2, Math.round(size * 0.022)) };
  const gap = Math.round(size * 0.045);
  const top = Math.round((size - (wh + gap + bar.h)) / 2);
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
      <rect x="${(size - bar.w) / 2}" y="${top + wh + gap}" width="${bar.w}" height="${bar.h}" rx="${bar.h / 2}" fill="${GOLD}"/>
    </svg>`,
  );
  let img = sharp(bg).composite([{ input: w, left: Math.round((size - ww) / 2), top }]);
  if (flatten) img = img.flatten({ background: GREEN });
  return img.png().toBuffer();
}

const files = {
  "icon-192.png": await icon(192, 0.62),
  "icon-512.png": await icon(512, 0.62),
  "icon-maskable-512.png": await icon(512, 0.5),
  // iOS: 180×180, no transparency (it would show black), iOS rounds the corners itself.
  "apple-touch-icon.png": await icon(180, 0.62, { flatten: true }),
  "favicon-48.png": await icon(48, 0.7, { radius: 10 }),
};
for (const [name, buf] of Object.entries(files)) await sharp(buf).toFile(`${OUT}/${name}`);
console.log(`Wrote ${Object.keys(files).join(", ")}`);
