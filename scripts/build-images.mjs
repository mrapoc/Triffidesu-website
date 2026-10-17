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

// Scout Association badge artwork, self-hosted so the badges page makes no
// third-party requests (their CDN sets a cookie). Tiles show it at 72px, so a
// single 2x variant is all it needs.
let badges = 0;
for (const name of await readdir('images/badges')) {
  if (!/\.png$/i.test(name)) continue;
  const file = path.join('images/badges', name);
  await sharp(file)
    .resize({ width: 144, withoutEnlargement: true })
    .webp({ quality: 90, effort: 6, nearLossless: true })
    .toFile(file.replace(/\.png$/i, '-144.webp'));
  badges++;
}
console.log(`${badges} badge variants`);

// Hero photos are the largest thing on a phone's first screen and sit under a
// dark scrim, so their phone and tablet widths are saved lighter than normal,
// with no visible difference behind the scrim. Desktop
// widths keep the normal quality from the ladder above.
const HEROES = ['kyaking', 'kyaking 2', 'first aid', 'first aid 3', 'rock climbing', 'map reading',
  'remembrance', 'remembrance 2', 'bike ride 2', 'fire'];
let heroes = 0;
// Busy photos (foliage, maps) compress worse, so each gets the highest quality
// that keeps its 800px phone file under 45KB.
const HERO_BUDGET = 45000;
for (const name of HEROES) {
  const file = `images/${name}.jpg`;
  const { width } = await sharp(file).metadata();
  let quality = 55;
  while (quality > 35) {
    const { length } = await sharp(file).resize({ width: 800 }).webp({ quality, effort: 6 }).toBuffer();
    if (length <= HERO_BUDGET) break;
    quality -= 5;
  }
  for (const w of [480, 640, 800, 1080].filter((w) => w <= width)) {
    await sharp(file).resize({ width: w }).webp({ quality, effort: 6 }).toFile(`images/${name}-hero-${w}.webp`);
    heroes++;
  }
  // A portrait phone only ever shows the central strip of a landscape hero, so
  // phones get that strip alone (3:5): the same detail on screen for about half
  // the bytes. Pages offer these through <picture> for screens up to 480px.
  for (const w of [360, 486]) {
    await sharp(file).resize({ width: w, height: Math.round(w / 0.6), fit: 'cover' })
      .webp({ quality, effort: 6 }).toFile(`images/${name}-hero-m-${w}.webp`);
    heroes++;
  }
}
console.log(`${heroes} hero variants`);
