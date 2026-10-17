// Runs a PHP script with the extensions the site needs on 20i (curl, gd,
// mbstring, openssl), loading any this machine's PHP doesn't enable by default.
// A stock Windows PHP ships them in ext/ but switched off.
//
//   node scripts/php.mjs server/tests/run.php
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const NEEDED = ['curl', 'gd', 'mbstring', 'openssl'];
const loaded = execFileSync('php', ['-m'], { encoding: 'utf8' }).toLowerCase().split(/\r?\n/);
const missing = NEEDED.filter((ext) => !loaded.includes(ext));

const args = [];
if (missing.length) {
  const binary = execFileSync('php', ['-r', 'echo PHP_BINARY;'], { encoding: 'utf8' });
  const extDir = path.join(path.dirname(binary), 'ext');
  if (existsSync(extDir)) args.push('-d', `extension_dir=${extDir}`);
  for (const ext of missing) args.push('-d', `extension=${ext}`);
}

// Windows PHP ships without a CA bundle, so HTTPS fails. Borrow Git's.
const caInfo = execFileSync('php', ['-r', 'echo ini_get("curl.cainfo");'], { encoding: 'utf8' });
if (!caInfo && process.platform === 'win32') {
  const git = execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0];
  const bundle = [path.dirname(git), path.join(path.dirname(git), '..'), path.join(path.dirname(git), '..', '..')]
    .map((dir) => path.join(dir, 'mingw64', 'etc', 'ssl', 'certs', 'ca-bundle.crt'))
    .find(existsSync);
  if (bundle) args.push('-d', `curl.cainfo=${bundle}`);
}

const result = spawnSync('php', [...args, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
