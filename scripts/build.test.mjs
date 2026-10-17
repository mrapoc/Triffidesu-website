// Checks the built site: every page self-contained, every local link and image
// present in dist/. Runs the build first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });

// Written on the server by the Instagram sync, so absent from a build.
const SYNCED = /^\/(news\/|data\/|instagram-media\/|sitemap-posts\.xml)/;
const pages = readdirSync('dist').filter((f) => f.endsWith('.html')).concat('server/templates/page.html');

for (const page of pages) {
  test(page, () => {
    const html = readFileSync(path.join('dist', page), 'utf8');
    assert.ok(/<style>([\s\S]*?)<\/style>/.exec(html)?.[1].length > 10000, 'stylesheet inlined');
    assert.doesNotMatch(html, /css\/style\.css|netlify/i);
    assert.match(html, /<script src="\/js\/main\.[0-9a-f]{10}\.js" defer><\/script>/);

    const urls = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1])
      .concat([...html.matchAll(/\b(?:srcset|imagesrcset)="([^"]*)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(' ')[0])));
    for (const url of urls) {
      if (/^(https?:|mailto:|#)/.test(url) || url === '') continue;
      assert.ok(url.startsWith('/'), `${url} is root-absolute`);
      const target = decodeURIComponent(url.split('#')[0]);
      if (SYNCED.test(target) || target === '/') continue;
      assert.ok(existsSync(path.join('dist', target)), `${url} exists in dist`);
    }
  });
}

test('server files and .htaccess are shipped', () => {
  for (const file of ['.htaccess', 'server/bootstrap.php', 'server/calendar.php', 'server/instagram.php', 'server/instagram-sync.php']) {
    assert.ok(existsSync(path.join('dist', file)), file);
  }
  assert.ok(!existsSync('dist/server/tests'), 'tests not shipped');
});

// The feed hooks js/main.js looks up by ID (docs/feed-contract.md). An edit that
// drops one empties that feed without any error, so catch it here.
const FEED_HOOKS = {
  'index.html': ['programme-calendar', 'latest-news', 'latest-news-fallback', 'latest-news-loading',
    'instagram-feed', 'instagram-feed-loading', 'instagram-feed-fallback'],
  'gallery.html': ['gallery-grid', 'gallery-filters', 'gallery-count', 'gallery-loading', 'gallery-fallback'],
};

for (const [page, ids] of Object.entries(FEED_HOOKS)) {
  test(`${page} keeps its feed hooks`, () => {
    const html = readFileSync(path.join('dist', page), 'utf8');
    for (const id of ids) assert.match(html, new RegExp(`\\bid="${id}"`), `#${id} missing`);
  });
}
