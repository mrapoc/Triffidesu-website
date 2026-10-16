# triffidesu

Shared rules: ~/Projects/AGENTS.md (global guide). This file holds project facts only.

## Purpose
Public website for Triffid Explorer Scouts, Ludlow (13-18s): activities, DofE, joining,
gallery, funding appeal. Hosted on Netlify.

## Architecture
- Static HTML pages at the root, one stylesheet (`css/style.css`), one script (`js/main.js`).
- `js/main.js` renders two live feeds as HTML strings: Instagram and the
  OnlineScoutManager programme. Netlify Functions in `netlify/functions/` serve them
  (`instagram*.js`, `calendar.js`), with Netlify Blobs as the cache.
- `_headers`, `_redirects`, `sitemap.xml`, `robots.txt`, `llms.txt` are Netlify/SEO config.
- `scripts/build-images.mjs` (sharp) builds responsive images.
- `docs/` holds the feed contract, funding case text and social notes.

## Conventions and safety
- Before changing markup, read [docs/feed-contract.md](docs/feed-contract.md): moving or
  renaming a feed hook without changing `js/main.js` in the same commit silently empties
  the feed. CSS-only changes are safe.
- `docs/funding-case.md` is the single source for grant and press text; edit it there.
- Treat a push or merge to `main` as publishing the live Netlify site; do it only when Sam asks.

Verification commands: [DEVELOPMENT.md](DEVELOPMENT.md).

## Workspace standard

Follow [.workspace/STANDARD.md](.workspace/STANDARD.md). Related context and verification
contracts are indexed in [.workspace/project.json](.workspace/project.json).
