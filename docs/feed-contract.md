# What a redesign must not break

Both live feeds — the Instagram feed and the OnlineScoutManager programme — are
rendered by `js/main.js` as **HTML strings assigned to `innerHTML`**. Nothing
about them is declarative: the markup lives in JavaScript, and the CSS in
`css/style.css` styles what that JavaScript produces.

That has one practical consequence for any design work:

- **Changing only CSS is safe.** Restyle the selectors below, change the tokens
  in `:root`, and both feeds keep working untouched.
- **Changing markup is not safe on its own.** If a hook below moves, is renamed,
  or is dropped from a page, the matching code in `js/main.js` has to change in
  the same commit or the feed silently renders nothing.

The lists below are the full set of hooks. They were read straight out of
`js/main.js` — if you change one, grep for it there first.

## OnlineScoutManager programme

Code: `renderProgramme()` and friends in `js/main.js`. Data: `/api/calendar`,
served by `server/calendar.php`, which relays the OSM iCal feed (OSM allows no
cross-site reads) and keeps an hour-old copy.

**Hook the page must provide**

| Hook | Where | If it goes missing |
| --- | --- | --- |
| `#programme-calendar` | `index.html:286` | The whole block is skipped — no fetch, no calendar, no error |

**Markup `renderProgramme()` emits into it**

```html
<div class="programme-event is-next">      <!-- .is-next on the first event only -->
  <div class="programme-date">
    <span class="day">12</span>
    <span class="month">Sep</span>
  </div>
  <div class="programme-details">
    <h3>Event name</h3>
    <span class="programme-time">Fri • 7pm – 9pm</span>
  </div>
  <span class="programme-badge">Next</span>  <!-- first event only -->
</div>
```

Styled at `css/style.css:2317-2426`. `.programme-list` is the container class on
the `#programme-calendar` div itself.

**Failure behaviour worth preserving:** if `/api/calendar` fails (it serves its
last good copy while OSM is down, so that means no copy at all), a plain-text
"Unable to load programme" message with a subscribe link replaces the list. Past events are filtered out and the
list is capped at the next 10.

## Instagram

Code: the Instagram section of `js/main.js`. Data: `/data/instagram.json`,
written by the hourly `server/instagram-sync.php`; see `instagram-feed.md` for
how that side works. Each image in it is `{ src, srcset, width, height }`.

One `fetch('/data/instagram.json')`, made after the page's first paint, feeds **every**
Instagram surface below. It fires if any of `#latest-news`, `#instagram-feed`,
or `[data-tag], .tag-feed, #gallery-grid` is present.

**Hooks the pages must provide**

| Hook | Where | Purpose |
| --- | --- | --- |
| `#latest-news` | `index.html:343` | Featured post container |
| `#latest-news-fallback` | `index.html:345` | Shown if the feed fails; `display:none` until then |
| `#latest-news-loading` | `index.html:356` | Removed once the post lands |
| `#instagram-feed` | `index.html:366` | The grid |
| `#instagram-feed-loading` | `index.html:367` | Removed once tiles land |
| `#instagram-feed-fallback` | `index.html:369` | Shown if the feed fails |
| `#gallery-grid` | `gallery.html:96` | Every photo, one tile per slide |
| `#gallery-filters` | `gallery.html:85` | Filter bar; `hidden` until built |
| `#gallery-count` | `gallery.html:82` | Photo count text |
| `#gallery-loading` / `#gallery-fallback` | `gallery.html:97,98` | As above |
| `.tag-feed[data-tag][data-count]` | `dofe`, `join`, `support` | Short strip of matching posts; `hidden` until filled |
| `img[data-topic]` / `img[data-tag]` | `index.html`, `moving-up`, `bring-a-mate`, `join` | Static photo swapped for the newest matching real one. The build moves its `src`/`srcset` to `data-src`/`data-srcset` (with a `<noscript>` copy) so it is only downloaded if nothing replaces it |
| `[data-tag-section]` | wraps each `.tag-feed` | Whole section removed if its tag matches nothing |

The `#latest-news-*` and `#instagram-feed-*` IDs are looked up by string in
`removeEl()` / `showEl()`, so renaming the element is not enough — the string in
`js/main.js` has to change too.

**Markup the JS emits**

- Grid and strip tiles: `a.instagram-post[data-post]` wrapping an `img`, plus an
  optional `.instagram-post-type--video` / `--album` badge and, in the main grid
  only, `.instagram-post-caption`. Tiles past the fold get `.is-hidden`.
- Gallery tiles: same, plus `data-slide`.
- "Show more" button: `button.btn.btn-outline.instagram-more`, inserted
  **after** the grid via `insertAdjacentElement('afterend', …)` — it is a
  sibling of the grid, not a child. The gallery variant adds `.gallery-more`.
- Featured post: `.two-col` > `.two-col-image` (with `button.news-image-open`
  wrapping `#latest-news-image`, and `.news-gallery` > `.news-gallery-thumb`
  for carousels) and `.two-col-text` (`.post-date`, `.post-caption`,
  `button.news-read-more`).
- Lightbox: the entire `.lightbox` subtree is built in JS —
  `.lightbox-backdrop`, `-panel`, `-close`, `-media`, `-image`, `-nav`,
  `-prev`, `-next`, `-dots`, `-dot`, `-body`, `-date`, `-caption`, `-source`.
  It is never in the HTML, so it can only be restyled, never re-marked-up from
  a template. `body.lightbox-open` locks scroll while it's up.
- Captions render `.caption-tag` spans around `#hashtags` and `@mentions`.

`.instagram-grid` is the shared grid container class, used by the homepage feed,
the gallery, and every `.tag-feed`. Restyling it changes all three at once.

## Checking the feeds after a change

`npm test` covers the sync and the build, not these hooks. Build, then serve
`dist/` with the PHP endpoints working:

```
npm run build
node scripts/php.mjs -S 127.0.0.1:8080 -t dist scripts/dev-router.php
```

`dist/` has no synced posts. Run the sync into it first (with a token in a local
`private/triffid-config.php`, see `server/tests/run.php` for the environment
variables), or copy `data/` and `instagram-media/` from the live site.

Then confirm, on `index.html`: the programme list has dated events with a "Next"
badge on the first; the featured post has an image and caption; the grid has
tiles that open the lightbox rather than navigating away; and `gallery.html`
shows a filter bar whose buttons change the photo count.

Two caveats when working in a Claude Code web container:

- **Outbound access to `www.onlinescoutmanager.co.uk` is blocked** by the
  sandbox network policy (the proxy returns 403 to `CONNECT`), so the programme
  feed cannot be fetched for real from there. It will render its fallback
  message. That is the environment, not a bug in the site.
- The sync needs a real Instagram token, so it won't fetch real posts locally
  without one.

Where a live fetch isn't possible, drive the render functions with a saved
sample payload instead, and check the emitted classes against the lists above.
