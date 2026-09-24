// Builds dist/, the exact folder that goes into public_html on 20i.
//
//   npm run build
//
// What it does to the source pages, all for page speed:
//   - inlines the minified stylesheet into every page, so first paint needs no
//     second request (the whole thing is ~12KB gzipped)
//   - minifies js/main.js and gives it a content-hashed name, so it can be
//     cached for a year and still update the moment it changes
//   - holds back below-the-fold photos until after first paint (see below)
//   - makes every local link root-absolute, so the same header and footer work
//     from /news/ pages and from the 404 page at any depth
//
// It never touches data/, instagram-media/, news/ or sitemap-posts.xml: those
// are written on the server by the hourly Instagram sync and must survive an
// upload. See docs/hosting.md.
import { transform as transformCss } from 'lightningcss';
import { transform as transformJs } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'dist';
const PAGES = (await readdir('.')).filter((name) => name.endsWith('.html'));
const STATIC_FILES = ['favicon.ico', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'llms.txt'];
const SERVER_FILES = ['bootstrap.php', 'calendar.php', 'instagram.php', 'instagram-sync.php'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Stylesheet: its url()s point at ../fonts, which only works from /css/. Inline,
// they need to be absolute.
const cssSource = (await readFile('css/style.css', 'utf8')).replace(/url\((["']?)\.\.\//g, 'url($1/');
const css = transformCss({ filename: 'style.css', code: Buffer.from(cssSource), minify: true }).code.toString();

const js = (await transformJs(await readFile('js/main.js', 'utf8'), { minify: true, target: 'es2017' })).code;
const jsName = `js/main.${createHash('sha256').update(js).digest('hex').slice(0, 10)}.js`;
await mkdir(path.join(OUT, 'js'), { recursive: true });
await writeFile(path.join(OUT, jsName), js);

const isRelative = (url) => url && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
const absolute = (url) => {
  if (!isRelative(url)) return url;
  if (url === 'index.html') return '/';
  if (url.startsWith('index.html#')) return '/' + url.slice('index.html'.length);
  return '/' + url;
};

function buildPage(html, name) {
  const linkTag = /<link rel="stylesheet" href="\/?css\/style\.css">/;
  const scriptTag = /<script src="\/?js\/main\.js" defer><\/script>/;
  if (!linkTag.test(html) || !scriptTag.test(html)) throw new Error(`${name}: stylesheet or script tag not found`);

  return html
    .replace(linkTag, () => `<style>${css}</style>`)
    // Photos below the fold (loading="lazy") and photos a topic can replace
    // (data-topic / data-tag) are held back as data-src, with a <noscript> copy.
    // js/main.js releases the first kind straight after first paint, so they
    // never compete with the hero, and still load lazily after that. The second
    // kind it swaps for the newest matching Instagram post, loading the original
    // only if nothing matches, so a replaced photo is never downloaded at all.
    .replace(/<img\b[^>]*\b(?:loading="lazy"|data-(?:topic|tag)=")[^>]*>/g, (tag) =>
      `${tag.replace(/\s(src|srcset)="/g, ' data-$1="')}<noscript>${tag}</noscript>`)
    .replace(scriptTag, `<script src="/${jsName}" defer></script>`)
    .replace(/\b(href|src)="([^"]*)"/g, (_, attr, url) => `${attr}="${absolute(url)}"`)
    .replace(/\b(srcset|imagesrcset)="([^"]*)"/g, (_, attr, list) =>
      `${attr}="${list.split(',').map((entry) => absolute(entry.trim())).join(', ')}"`);
}

const pageSources = [];
for (const name of PAGES) {
  const source = await readFile(name, 'utf8');
  pageSources.push(source);
  await writeFile(path.join(OUT, name), buildPage(source, name));
}

await mkdir(path.join(OUT, 'server/templates'), { recursive: true });
const template = await readFile('server/templates/page.html', 'utf8');
await writeFile(path.join(OUT, 'server/templates/page.html'), buildPage(template, 'server/templates/page.html'));
for (const file of SERVER_FILES) await cp(path.join('server', file), path.join(OUT, 'server', file));

for (const file of STATIC_FILES) await cp(file, path.join(OUT, file));
await cp('hosting/htaccess', path.join(OUT, '.htaccess'));
await cp('fonts', path.join(OUT, 'fonts'), { recursive: true });

// Images: every WebP variant, plus any master a page, the manifest or the
// structured data names directly (share cards, the logo, the touch icon).
const sources = [...pageSources, template, await readFile('site.webmanifest', 'utf8')].join('\n');
const referenced = new Set([...sources.matchAll(/images\/[^"'\s,)]+/g)].map((m) => decodeURI(m[0])));
let copied = 0;
for (const entry of await readdir('images', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath, entry.name).split(path.sep).join('/');
  if (!file.endsWith('.webp') && !referenced.has(file)) continue;
  await cp(file, path.join(OUT, file));
  copied++;
}

console.log(`dist/: ${PAGES.length} pages, ${copied} images, CSS ${(css.length / 1024).toFixed(1)}KB inline, ${jsName} ${(js.length / 1024).toFixed(1)}KB`);
