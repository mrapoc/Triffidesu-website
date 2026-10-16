# Development

Cross-platform commands (macOS and Windows).

- Install: `npm ci`
- Run: serve the folder with any static server. The live feeds need the Netlify
  Functions and their Netlify environment; never commit those credentials.
- Images: `npm run build:images`
- Test: no automated suite. Check changed pages in a browser at phone and desktop widths,
  including both feeds, and look for console errors.
- Final gate: `npm run build:images` succeeds and the changed journeys work in the browser.

## Workspace standard

Follow [.workspace/STANDARD.md](.workspace/STANDARD.md). Related context and verification
contracts are indexed in [.workspace/project.json](.workspace/project.json).
