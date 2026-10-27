// Publishes the site: tests and builds, then commits dist/ as the whole of the
// `live` branch and pushes it. 20i's Git deployment pulls `live` into
// public_html. Run through `npm run deploy` from a clean checkout of main.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const git = (args, env) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });

if (git(['status', '--porcelain'])) throw new Error('Commit or stash your changes first: live must match a commit.');
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main' && !process.argv.includes('--any-branch')) {
  throw new Error(`On ${branch}, not main. Pass --any-branch to publish it anyway.`);
}

git(['fetch', 'origin']);
const source = git(['rev-parse', '--short', 'HEAD']);
run('npm', ['test']);
// Says which commit is live: https://www.triffidesu.co.uk/version.txt
writeFileSync('dist/version.txt', `${git(['rev-parse', 'HEAD'])}\n`);
// 20i runs this after each pull to copy the clone into public_html.
copyFileSync('hosting/20i-deploy.sh', 'dist/.20i-deploy.sh');

// A throwaway index, so dist/ becomes the branch root without touching the
// working tree or the real index.
const dir = mkdtempSync(path.join(tmpdir(), 'triffidesu-deploy-'));
const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
try {
  git(['--work-tree=dist', 'add', '--all', '--force', '.'], env);
  const tree = git(['write-tree'], env);
  let parent = '';
  try { parent = git(['rev-parse', '--verify', '--quiet', 'origin/live']); } catch {}
  if (parent && git(['rev-parse', `${parent}^{tree}`]) === tree) {
    console.log('live already matches this build; nothing to publish.');
  } else {
    const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Publish ${branch} at ${source}`]);
    git(['push', 'origin', `${commit}:refs/heads/live`]);
    console.log(`Pushed ${branch} at ${source} to live. 20i deploys it within a few minutes; then run npm run verify:live.`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
