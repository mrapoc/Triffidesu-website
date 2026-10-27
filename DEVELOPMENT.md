# Local development and verification

Read AGENTS.md. This is a static site with a small build step and two PHP
scripts, not a framework application. Commands checked on 24 September 2026
with Node 24 and PHP 8.4.

```
npm install
npm test
npm run build
node scripts/php.mjs -S 127.0.0.1:8080 -t dist scripts/dev-router.php
```

`npm test` builds the site, checks every local link and image in the output
resolves, and runs `server/tests/run.php` (calendar relay and Instagram sync
against a fake network, writing only to a temporary folder).

`dist/` has no Instagram posts until a sync runs into it; see
docs/feed-contract.md. Run `npm run build:images` only when source images or
their generation change, and inspect the generated diffs. Inspect package
lifecycle scripts before installing fresh dependencies.

Verify changed pages in a browser at phone and desktop sizes: screenshots,
keyboard access, console errors, image loading, and the feed-failure fallbacks.
Lighthouse runs use the shared build worker (BUILD_WORKER.md) against the built
output with synced posts; PageSpeed Insights against the live site is the final
word, since 20i's own network and compression aren't reproduced locally.

Publishing: `npm run deploy` on a clean `main` tests, builds and pushes `dist/`
as the `live` branch, which 20i's Git deployment pulls into `public_html`; then
run `npm run verify:live` (docs/publishing.md). Deploying, pushing to `live` or
a manual zip upload (docs/hosting.md) needs Sam's authorization, as do DNS changes and anything touching the live Instagram token.
New worktrees need their own `npm install`; `private/` config never leaves the
host. Keep durable decisions in docs and use short handovers with branch,
changes, checks and next step when changing tasks.

## Workspace standard

Follow [.workspace/STANDARD.md](.workspace/STANDARD.md). Related context and verification
contracts are indexed in [.workspace/project.json](.workspace/project.json).
