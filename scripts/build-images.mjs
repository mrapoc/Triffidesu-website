// Regenerates the WebP variants that the pages' srcset attributes point at.
//
//   node scripts/build-images.mjs
//
// Every photograph in images/ gets a ladder of widths capped at its own
// intrinsic width, written alongside it as "<name>-<width>.webp". The JPEGs
// and PNGs stay put as the masters; nothing on the site links to them any
// more, apart from the share cards in images/og.
//
// Adding a photo: drop the JPEG in images/, run this, then point the <img>
// at the new .webp files. The srcset lists every width this produced, and
// `sizes` should say how wide the image is actually rendered — get that
// wrong and the browser downloads the wrong file.
import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const LADDER = [320, 480, 640, 800, 1080, 1440, 1920, 2048];
const DIRS = ['images', 'images/scouts'];
const SOURCE = /\.(jpe?g|png)$/i;

let written = 0, bytes = 0;
for (const dir of DIRS) {
  for (const name of await readdir(dir)) {
    if (!SOURCE.test(name)) continue;
    const file = path.join(dir, name);
    if (!(await stat(file)).isFile()) continue;
    // Share cards are for Facebook, which wants a JPEG.
    if (file.startsWith('images/og/')) continue;

    const src = sharp(file);
    const { width } = await src.metadata();
    const flat = /\.png$/i.test(name);
    const base = file.replace(SOURCE, '');

    for (const w of LADDER.filter(w => w <= width)) {
      const out = `${base}-${w}.webp`;
      const info = await sharp(file)
        .resize({ width: w, withoutEnlargement: true })
        .webp(flat ? { quality: 92, effort: 6, nearLossless: true } : { quality: 78, effort: 6 })
        .toFile(out);
      written++; bytes += info.size;
    }
  }
}
console.log(`${written} variants, ${(bytes / 1048576).toFixed(1)} MB total`);
