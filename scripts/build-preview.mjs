// Builds dist/ for a Cloudflare Pages preview of a pull request. Cloudflare's
// build command: npm run build:preview, output folder: dist.
//
// Same pages as the real build, minus what only works on 20i: the PHP relays
// and .htaccess are dropped (Cloudflare would serve them as plain text), so the
// programme and Instagram feeds show their fallback messages on a preview.
// Every response is marked noindex so search engines never list a preview.
import { execFileSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await rm('dist/server', { recursive: true, force: true });
await rm('dist/.htaccess', { force: true });
await writeFile('dist/_headers', '/*\n  X-Robots-Tag: noindex\n');
