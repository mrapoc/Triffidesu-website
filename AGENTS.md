# Triffid ESU website operating guide

## Project shape

A static website: root-level HTML pages, shared CSS/JS and images, hosted on
20i shared Linux hosting (Apache + PHP). There is no application framework and
no database. Two small PHP jobs live in `server/`: the Online Scout Manager
calendar relay and the hourly Instagram sync, which also writes a news page per
post. How it is hosted: [docs/hosting.md](docs/hosting.md). A push to `main` publishes
it: GitHub Actions builds the `live` branch, which holds only the built site,
and pulls it onto 20i ([docs/publishing.md](docs/publishing.md)).

## Commands

```
npm test               # build + link check, and the PHP sync/calendar tests
npm run build          # dist/: the exact web root contents
npm run build:preview  # dist/ for a Cloudflare Pages pull request preview
npm run package        # build, then release/triffidesu-site.zip for 20i
npm run deploy         # test, build, push dist/ to the live branch (CI runs it)
npm run verify:live    # read-only checks against the deployed site
npm run build:images   # only when source images or their generation change
```

`scripts/php.mjs` runs PHP with the extensions 20i provides (curl, gd,
mbstring), loading them on a stock Windows PHP.

## Rules

- Preserve the existing visual language and shared navigation/footer patterns.
  `server/templates/page.html` carries the header and footer for the generated
  news pages: keep it in step with the root pages.
- Author pages with ordinary relative links and `<link rel="stylesheet"
  href="css/style.css">` / `<script src="js/main.js" defer>`. The build inlines
  the CSS, hashes the script and makes links root-absolute; don't do it by hand.
- Keep `hosting/htaccess`, canonical URLs, `robots.txt`, `sitemap.xml` and
  `llms.txt` consistent with routing changes.
- Optimize new images through the existing build script; do not hand-edit
  generated image variants.
- Maintain accessible headings, link text, keyboard navigation, contrast and
  mobile layouts. Lighthouse is at 100 in all four categories on desktop and
  mobile; treat a regression as a bug.
- Never ship anything from `private/` or put a token in the repository.
- A push or merge to `main` publishes the live site, as do `npm run deploy` and
  any push to `live`. Do it only when Sam asks. Never point 20i at `main`: it
  would serve the unbuilt repo.
- Do not upload to 20i, change DNS or change live integrations unless
  explicitly requested.

## Verification

Check affected pages at desktop and mobile widths against a running local copy
(`docs/hosting.md`). Run the image build only when source images or generation
logic changed.

## Workspace standard

Follow [.workspace/STANDARD.md](.workspace/STANDARD.md). Related context and verification
contracts are indexed in [.workspace/project.json](.workspace/project.json).
