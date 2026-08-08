# Instagram feed setup

The **Latest News** and **Latest Adventures** sections on the homepage come from
our Instagram account. Post to Instagram and the site catches up on its own — no
code changes, no re-deploy.

## How it works

Everything runs on Netlify. There's no third-party feed service involved, which
is deliberate: the previous setup used Curator.io, and when that stopped syncing
the site went stale with no way to tell.

1. **`netlify/functions/instagram-sync.js`** runs every night at 05:00 UTC. It
   fetches our most recent posts, downloads every image — including each slide
   of a multi-photo post — and stores the images and post details in Netlify
   Blobs.
2. **`netlify/functions/instagram.js`** hands that stored copy to the homepage as
   JSON. Instagram isn't involved in a page view at all.
3. **`netlify/functions/instagram-media.js`** serves the copied images from
   `/instagram-media/<post id>-<slide>`, cached hard at the edge.
4. **`js/main.js`** renders the newest post as the featured **Latest News** card
   and the rest as the **Latest Adventures** grid.

## Multi-photo posts

Post a carousel and every slide is copied, in the order you arranged them.

- **In the grid**, the post appears once, showing its first photo with a
  stacked-cards badge in the corner so people can see there's more. Clicking
  goes to the post on Instagram. One post is always one tile — a ten-photo
  carousel never floods the grid.
- **On the featured card**, all the slides appear as a thumbnail strip under the
  main photo. Clicking a thumbnail swaps the main image. It works from the
  keyboard too.

Videos and reels show their cover frame with a play badge; playback stays on
Instagram. Instagram's own limit of ten slides per carousel is also our cap.

## Reading a post without leaving the site

We hold the images and the caption, so there's no reason to hand a visit over to
Instagram just because someone wants to read a post. Clicking a grid tile — or
the photo on the featured card — opens the post **in place**: full-size photos,
arrows and dots for carousels, and the complete caption.

- Arrow keys and swipe move between slides; Escape or a click outside closes it.
- Focus moves into the dialog and returns to whatever was clicked on close.
- The tiles are still real links to Instagram underneath, so middle-click,
  ctrl-click and no-JS all still work. A "View on Instagram" link sits at the
  bottom of every post — going there is a choice now, not the only route.

Captions render as real paragraphs rather than a single run-on block, with
hashtags and `@mentions` knocked back visually so the words lead. A trailing
block of hashtags — the usual Instagram sign-off — is dropped entirely.

The featured card shows the first 500 characters (`FEATURED_CAPTION_LENGTH` in
`js/main.js`) and then offers **Read the full post**, which opens the same
dialog rather than sending people away.

## How much shows

Two separate numbers, deliberately:

| What | Where | Default |
| --- | --- | --- |
| How many posts are **kept** | `INSTAGRAM_POST_LIMIT` env var in Netlify | 12 |
| How many grid tiles show **before "Show more"** | `TILES_BEFORE_MORE` in `js/main.js` | 8 |

The grid shows the first eight, then a **Show more posts** button reveals the
rest. Everything is already in the JSON, so expanding costs no extra request.

Eight is a multiple of the grid's column count — four across on desktop, two on
mobile — so the last row is never left ragged. If you change it, a multiple of
four keeps that tidy. To hold more history, set `INSTAGRAM_POST_LIMIT` in Netlify
(anything above 50 is capped); no redeploy needed beyond the usual one for an
environment variable change.

Because the posts and images are copied rather than linked, the site doesn't
depend on Instagram staying up:

- If a nightly sync fails, it leaves the stored copy alone and the site carries
  on showing the last good set of posts. Only new posts stop appearing.
- Images are served from our own domain, so they can't break when Instagram's
  signed CDN URLs expire, and they're fast.
- If there's no stored copy at all — the window between deploying and the first
  sync — the feed function falls back to a live Instagram call.
- If everything fails, the page shows the hand-written news card in `index.html`
  and a "View our Instagram" button. No empty sections.

## One-off setup

You need an Instagram **Business** or **Creator** account (switch in the
Instagram app under Settings → Account type), linked to our Facebook Page.
Personal accounts can't use the API.

There are two ways to get a token. **Use the system user one** — it never
expires, so there's nothing to maintain afterwards.

### Recommended: a Business system user token (never expires)

This needs the Instagram account and Facebook Page to be in our Meta Business
portfolio, which they are if they show up in Business Suite.

1. Go to <https://developers.facebook.com/apps> and create an app of type
   **Business**, owned by our business portfolio.
2. Open **Business settings** at <https://business.facebook.com/settings> →
   **Users → System users → Add**. Name it something like `website-feed` and give
   it the **Employee** role.
3. With the system user selected, click **Add assets** and assign:
   - the Facebook Page, with **Full control**
   - the Instagram account, with **Full control**
   - the app from step 1
4. Click **Generate new token**, pick the app, set expiry to **Never**, and tick
   the permissions `instagram_basic`, `pages_show_list` and
   `pages_read_engagement`.
5. Copy the token — this is the only time it's shown.

Because we're only reading our own Page and Instagram account, this works under
Standard Access and doesn't need App Review.

### If there's no business portfolio: a Page access token (also never expires)

Needs only a Facebook login with **full control of the Page** — no portfolio, and
no Instagram password. A Page token derived from a long-lived user token has no
expiry of its own.

1. Create the app as above; pick any portfolio it offers, or none. The app is
   just a credential container and gets no access to the Page by itself.
2. Open the **Graph API Explorer**
   (<https://developers.facebook.com/tools/explorer/>), select the app, and click
   **Generate access token**. Grant `instagram_basic`, `pages_show_list` and
   `pages_read_engagement`, and tick the Scouts Page when asked which to allow.
3. Copy the short-lived token it gives you and paste it into the **Access Token
   Debugger** (<https://developers.facebook.com/tools/debug/accesstoken/>). Click
   **Extend Access Token** at the bottom and copy the long-lived one.
4. Back in the Explorer, paste the long-lived token into the token box and
   request `me/accounts`. Find the Scouts Page in the response and copy its
   `access_token` — that's the Page token, and it's the one to use.

It can still be invalidated by a Facebook password change, removing the app, or
losing your role on the Page. Meta also expires tokens after roughly 90 days of
no API activity; the nightly sync counts as activity, so that doesn't bite.

### If neither works: an Instagram Login token (expires every 60 days)

Add the **Instagram** product to the app, choose **API setup with Instagram
login**, connect the `triffidesu` account and generate a long-lived token with
`instagram_business_basic`. Needs the Instagram password — or a Facebook login
that's in the same Accounts Center as the Instagram account.

The nightly sync refreshes this one automatically (see below), so it's still
hands-off; there are just more moving parts.

### Then, either way

In Netlify: **Site configuration → Environment variables → Add a variable**

| Key | Value |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | the token you generated |

`INSTAGRAM_USER_ID` is optional. With a system user token the code finds the
Instagram account attached to our Page by itself and remembers it; set the
variable only to pin a specific account.

Redeploy the site (Deploys → Trigger deploy) so the functions pick up the
variable. The first nightly sync copies everything across — to not wait, run it
by hand from **Site configuration → Functions → instagram-sync**, or with
`netlify functions:invoke instagram-sync`. The site works in the meantime via the
live fallback.

## About the token

The code works out which kind of token it has from the token itself: Instagram
Login issues `IG…` tokens, while Facebook Login and system users issue `EAA…`
ones. They use different API hosts, and only the Instagram ones expire.

**System user token (`EAA…`)** — no expiry, nothing to refresh, nothing to do.
It survives password changes and isn't tied to anyone's personal account. It can
still be invalidated deliberately, by removing the system user, its asset
assignments, or the app.

**Page token (`EAA…`)** — also no expiry, and treated identically by the code,
which reads the Instagram link straight off the Page. It is tied to the personal
account that generated it, so a password change or losing the Page role kills it.

**Instagram Login token (`IG…`)** — expires 60 days after it was last refreshed,
and Meta won't refresh it for you. The nightly sync exchanges it for a fresh
60-day token once it's more than a week old, which is a wide margin. Refreshed
tokens are stored in Netlify Blobs (store `social`, key `instagram-token`) and
take precedence over the environment variable, so `INSTAGRAM_ACCESS_TOKEN` is
only read until the first refresh.

If a token is ever revoked outright, generate a fresh one, update
`INSTAGRAM_ACCESS_TOKEN`, and delete the `instagram-token` blob (Netlify UI:
**Blobs → social**) so the new variable is picked up.

## Checking it works

Visit `https://triffidesu.co.uk/.netlify/functions/instagram`. A healthy response
looks like:

```json
{
  "posts": [
    {
      "id": "17912…",
      "caption": "…",
      "image": "/instagram-media/17912…-0",
      "images": ["/instagram-media/17912…-0", "/instagram-media/17912…-1"],
      "permalink": "https://www.instagram.com/p/…",
      "timestamp": "2026-03-12T18:04:11+0000",
      "mediaType": "CAROUSEL_ALBUM"
    }
  ],
  "syncedAt": "2026-03-13T05:00:04.120Z",
  "source": "cache"
}
```

- `"source": "cache"` means it's serving the copied posts, which is the normal
  state. `"live"` means no sync has landed yet.
- `syncedAt` is when the last successful sync ran. If it's more than a day or two
  old, check the `instagram-sync` logs under **Functions** in the Netlify UI —
  the failure reason is logged there.
- A `502` with an `error` field means the token is missing, expired, or lacks the
  right permission, and no copy has ever been stored. The message says which.
- "No Instagram Business account is linked to a Page this token can see" means the
  system user is missing an asset assignment — go back to step 3 above.

## Storage

A dozen posts' worth of images at a time — more if they're carousels — pruned on
each sync as older posts drop out of the
window, so the blob store stays at a few megabytes. Worth a glance at Netlify's
current free-tier Blobs allowance if the post limit is ever raised a lot.
