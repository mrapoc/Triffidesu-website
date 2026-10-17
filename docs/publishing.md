# Publishing changes, including from a phone

The live site is whatever is on the `main` branch. Merging a pull request into
`main` publishes it to 20i about two minutes later. Nobody uploads anything by
hand.

| Step | What happens | Where |
| --- | --- | --- |
| Edit a file and propose the change | A pull request (PR) is opened | github.com |
| Checks run | Build, links, feed hooks and PHP tests; a green tick or a red cross on the PR | GitHub Actions, workflow "Site" |
| Preview builds | A copy of the site at an unlisted `*.pages.dev` address | Cloudflare Pages |
| Merge the PR | The same checks run again, then `dist/` is copied into `public_html` on 20i and the live site is checked | GitHub Actions |

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
6. The **Actions** tab shows the upload. When the "Site" run for `main` is
   green, the change is live. Pull to refresh on the real site.

To change more than one file in the same PR: after step 3, go back to the
repository, switch to the PR's branch (the branch menu at the top), edit the
next file and commit straight to that branch.

### Undo

Open the merged PR and tap **Revert**. That opens a new PR putting things back;
merge it like any other and the old version is live again two minutes later.

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

### 1. Let GitHub upload to 20i

GitHub needs its own SSH key for the 20i package, kept as a repository secret.
It can do nothing except log in to this one hosting package.

1. Make a key pair just for this (an agent can make it and store the private
   half straight into GitHub without showing it). The private half never goes
   anywhere except the GitHub secret.
2. My20i: **Manage Hosting**, the `triffidesu.co.uk` package, **SSH Access**
   (under Security). Paste the public key into **Public Key**, tap
   **Add Public Key**. Note the username shown on that page (normally
   `triffidesu.co.uk`). Keys can take up to 30 minutes to start working.
3. GitHub: repository **Settings**, **Secrets and variables**, **Actions**,
   **New repository secret**, twice:
   - `TWENTYI_SSH_KEY`: the private key, whole file including the BEGIN and END
     lines.
   - `TWENTYI_SSH_USER`: the username from step 2.
4. Once this workflow is on `main`, test it any time without changing anything: **Actions**, **Site**, **Run workflow**,
   leave **List what would change without uploading** ticked, **Run workflow**.
   A green run that lists files means it connects and finds `public_html`.

The workflow pins 20i's UK SSH server key (`ssh.gb.stackcp.com`). If 20i ever
changes it, uploads fail safely with a host key error until the line in
`.github/workflows/site.yml` is updated.

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

`.github/workflows/site.yml`:

- On every PR: `npm ci`, then `npm test` with PHP 8.4, the version on 20i.
- On a push to `main`: the same, then `rsync` copies `dist/` into
  `public_html`. It overwrites changed files and never deletes, so the
  Instagram sync's `data/`, `instagram-media/`, `news/` and `sitemap-posts.xml`
  survive. Then `npm run verify:live` checks the real site. A failure there
  after a green upload usually means the Instagram sync or OSM is unwell, not
  the change.
- **Run workflow** on `main` with the box unticked uploads the current `main`
  again, for example after fixing something on the server by hand.

Old hashed `js/main.*.js` files are left in `public_html` because nothing is
deleted. They are tiny and harmless; clear them out by hand once in a while if
you like.
