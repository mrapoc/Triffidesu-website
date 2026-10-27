# Publishing changes, including from a phone

The live site is whatever is on the `live` branch. That branch holds only the
built site (`dist/`), made by `npm run deploy` from `main`; 20i's Git
deployment copies it into `public_html` whenever it changes. Nobody uploads
anything by hand.

| Step | What happens | Where |
| --- | --- | --- |
| Edit a file and propose the change | A pull request (PR) is opened | github.com |
| Checks run | Build, links, feed hooks and PHP tests; a green tick or a red cross on the PR | GitHub Actions, workflow "Site" (needs Actions minutes) |
| Preview builds | A copy of the site at an unlisted `*.pages.dev` address | Cloudflare Pages |
| Merge the PR | `main` changes; the live site does not yet | github.com |
| Publish | `npm run deploy` tests, builds and pushes `live`; 20i deploys it | a computer, or a Claude cloud session |

## On a phone, on a scout night

Use github.com in Safari or Chrome. The GitHub app is fine for reviewing and
merging, but it can't edit files.

1. Open the repository, tap the page to change (for example `join.html`), then
   the pencil icon.
2. Change the words. Leave anything inside `< >` alone unless you know what it
   does, especially `id="..."` and `data-...` (see "What to leave alone" below).
3. Tap **Commit changes...**, pick **Create a new branch for this commit and
   start a pull request**, tap **Propose changes**, then **Create pull request**.
4. Wait a minute or two. On the PR:
   - **Site** must show a green tick. A red cross means something broke; tap
     **Details** to see what, or leave it for later.
   - Cloudflare adds a preview link (a comment, or **Details** next to the
     Cloudflare check). Open it and look at the page you changed. The programme
     and Instagram sections show "unable to load" messages on a preview; that
     is expected, they only work on the real site.
5. Happy? Tap **Merge pull request**, then **Confirm merge**.
6. Publish: in the Claude app, start a cloud session on this repository and
   ask it to "deploy main". It runs `npm run deploy`, waits a few minutes,
   then `npm run verify:live`. Pull to refresh on the real site.

To change more than one file in the same PR: after step 3, go back to the
repository, switch to the PR's branch (the branch menu at the top), edit the
next file and commit straight to that branch.

### Undo

Open the merged PR and tap **Revert**. That opens a new PR putting things back;
merge it and publish again like any other change. In a hurry, `git push
origin live~1:live --force` puts the previous build back (needs Sam's say-so).

### What to leave alone

The Instagram and programme sections are filled in by `js/main.js`, which looks
for particular elements by name. If one of those disappears the section goes
blank without any error. The check on every PR fails if any of the main ones on
`index.html` or `gallery.html` go missing, but not all of them are covered; the
full list is [feed-contract.md](feed-contract.md).

Safe from a phone: wording, headings, prices, dates, adding or removing a
paragraph or list item. Ask for help with: new photos (they need resizing
through `npm run build:images`), new pages, and anything in `js/`, `css/`,
`server/` or `hosting/`.

## One-time setup

### 1. Let 20i deploy the `live` branch

My20i: the `triffidesu.co.uk` package, **Git Deployment** (GitHub connected),
repository `Triffidesu-website`, branch **`live`**, deployment path
`public_html` (the folder the website is served from, not the home folder).
20i keeps its Git clone there, so `.htaccess` answers 404 for `/.git`.

Never choose `main`: it holds the source, so 20i would serve unbuilt pages and
publish internal files such as `AGENTS.md`, `docs/` and `scripts/`.

### 2. Previews on Cloudflare Pages

The DNS is already in Cloudflare, so the same account is used.

1. Cloudflare dashboard, **Workers & Pages**, **Create**, choose the **Pages**
   option ("Import an existing Git repository" / "Connect to Git"; if only
   Workers is offered, look for the "Looking to deploy Pages?" link).
2. Connect GitHub. When GitHub asks which repositories, choose **Only select
   repositories** and pick `Triffidesu-website`.
3. Build settings: framework preset **None**, build command
   `npm run build:preview`, build output directory `dist`, production branch
   `main`. Under environment variables add `NODE_VERSION` = `24`.
4. **Save and Deploy**. The first build is the production branch; it lands on
   `<project>.pages.dev`, which nobody needs to visit.
5. Optional: project **Settings**, **Builds**, **Branch control**, turn off
   automatic production deployments. Previews for PRs keep working.

Every page on a preview is sent with `X-Robots-Tag: noindex`, so search
engines don't list it. The preview has no PHP, so the live feeds don't load
there.

## How it works

- `npm run deploy` (`scripts/deploy.mjs`) refuses to run with uncommitted
  changes or off `main`, runs `npm test` (which builds `dist/`), then commits
  `dist/` as the whole tree of `live`, on top of the previous `live` commit, and
  pushes it. The commit message names the `main` commit it came from, and
  `/version.txt` on the live site holds its full hash. If
  nothing changed it pushes nothing.
- 20i pulls `live` into `public_html`. The Instagram sync's `data/`,
  `instagram-media/`, `news/` and `sitemap-posts.xml` are not in the branch;
  if a deploy ever removes them, the next hourly sync writes them again.
- `.github/workflows/site.yml` only runs the checks, on every PR and push to
  `main`. It no longer uploads; the old SSH secrets `TWENTYI_SSH_KEY` and
  `TWENTYI_SSH_USER` can be deleted, along with that key in My20i SSH Access.
- `npm run verify:live` afterwards checks the real site. A failure about the
  last sync usually means the Instagram sync or OSM is unwell, not the change.
