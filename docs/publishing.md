# Publishing changes, including from a phone

The live site is whatever is on the `live` branch. That branch holds only the
built site (`dist/`). 20i keeps a Git clone of `live` in
`Triffidesu-website/`, which is the domain's document root. Every push to
`main` makes GitHub Actions build `live` and pull it into that clone, so a
merged change is live a couple of minutes later. Nobody logs into 20i or uploads
files by hand.

| Step | What happens | Where |
| --- | --- | --- |
| Edit a file and propose the change | A pull request (PR) is opened | github.com |
| Checks run | Build, links, feed hooks and PHP tests; a green tick or a red cross on the PR | GitHub Actions, workflow "Site" (needs Actions minutes) |
| Preview builds | A copy of the site at an unlisted `*.pages.dev` address | Cloudflare Pages |
| Merge the PR | `main` changes | github.com |
| Publish | `npm run deploy` tests, builds and pushes `live`; 20i's clone pulls it; the live site is checked | GitHub Actions, workflow "Site" |

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
5. Happy? Tap **Merge pull request**, then **Confirm merge**. That publishes
   it: a couple of minutes later `https://www.triffidesu.co.uk/version.txt`
   shows the new commit, and the **Site** run on `main` has a green tick. A red
   cross there means the site was not updated, or updated but failed a check;
   tap **Details**.

A Claude session in the Claude app can do all of this for you: ask it for the
change, then to merge it.

To change more than one file in the same PR: after step 3, go back to the
repository, switch to the PR's branch (the branch menu at the top), edit the
next file and commit straight to that branch.

### Undo

Open the merged PR and tap **Revert**. That opens a new PR putting things back;
merge it like any other change. In a hurry, `git push
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

Set up on 27 October 2026:

- My20i, **Git Version Control**: GitHub connected, repository
  `Triffidesu-website` cloned to `/home/sites/7a/f/f05cb1723f/Triffidesu-website`,
  deployment branch **`live`**. 20i itself only pulls when **Deploy** is
  pressed (20i support confirmed on 28 October 2026 that it has no
  deploy-on-push), so GitHub Actions does the pull over SSH instead. **Deploy**
  still works as a manual fallback. The Deployment Script field does not run
  commands, so leave it empty.
- My20i, **Manage Domains**: document root `Triffidesu-website`, so the clone
  is the site. `public_html` is no longer served; it still holds the old copy.
- 20i refuses `/.git` itself (403), so the clone's history is not readable.

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
- The workflow's "Pull live onto 20i" step SSHes in with the
  `TWENTYI_SSH_KEY` and `TWENTYI_SSH_USER` secrets and runs `git pull --ff-only`
  in the clone from the public GitHub URL, which is what **Deploy** does. It
  then checks `/version.txt` shows the commit and runs `npm run verify:live`.
- The repository is public (since 28 October 2026), so Actions is free, with
  secret scanning and push protection on. Never commit anything from
  `private/`.
- **Deploy** and the workflow both run `git pull` in the clone. The Instagram
  sync's `data/`, `instagram-media/`, `news/` and `sitemap-posts.xml` are
  untracked files there, so a pull leaves them alone.
- `npm run verify:live` afterwards checks the real site. A failure about the
  last sync usually means the Instagram sync or OSM is unwell, not the change.
