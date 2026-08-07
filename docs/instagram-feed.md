# Instagram feed setup

The **Latest News** and **Latest Adventures** sections on the homepage come from
our Instagram account. Post to Instagram and the site catches up on its own — no
code changes, no re-deploy.

## How it works

Everything runs on Netlify. There's no third-party feed service involved, which
is deliberate: the previous setup used Curator.io, and when that stopped syncing
the site went stale with no way to tell.

1. **`netlify/functions/instagram-sync.js`** runs every night at 05:00 UTC. It
   fetches our twelve most recent posts, downloads each image, and stores both
   the images and the post details in Netlify Blobs.
2. **`netlify/functions/instagram.js`** hands that stored copy to the homepage as
   JSON. Instagram isn't involved in a page view at all.
3. **`netlify/functions/instagram-media.js`** serves the copied images from
   `/instagram-media/<post id>`, cached hard at the edge.
4. **`js/main.js`** renders the newest post as the featured **Latest News** card
   and the next eight as the **Latest Adventures** grid.

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
Instagram app under Settings → Account type). Personal accounts can't use the
API.

1. Go to <https://developers.facebook.com/apps> and create an app of type
   **Business**.
2. Add the **Instagram** product and choose **API setup with Instagram login**.
3. Under **Generate access tokens**, connect the `triffidesu` Instagram account
   and generate a token. Make sure the `instagram_business_basic` permission is
   included.
4. Copy the generated long-lived token.
5. In Netlify: **Site configuration → Environment variables → Add a variable**

   | Key | Value |
   | --- | --- |
   | `INSTAGRAM_ACCESS_TOKEN` | the token from step 4 |

   `INSTAGRAM_USER_ID` is optional — leave it unset and the function uses
   whichever account the token belongs to.
6. Redeploy the site (Deploys → Trigger deploy) so the functions pick up the new
   variable.

The first nightly sync copies everything across. To not wait for it, run the sync
by hand once from **Site configuration → Functions → instagram-sync**, or with
`netlify functions:invoke instagram-sync`. Either way the site works in the
meantime via the live fallback.

## Keeping the token alive

Instagram long-lived tokens expire after 60 days, and Meta doesn't refresh them
for you — something has to call the refresh endpoint on a schedule. A lapsed
token is the usual reason a feed like this quietly stops updating.

The nightly sync handles it: once the live token is more than a week old it's
exchanged for a fresh 60-day one, which is a wide margin either way. Refreshed
tokens are stored in Netlify Blobs (store `social`, key `instagram-token`) and
take precedence over the environment variable, so `INSTAGRAM_ACCESS_TOKEN` is
only used until the first refresh. There's nothing to update by hand.

If the token is ever revoked outright — the Instagram password changes, or the
app's permissions are removed — generate a fresh one, update
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
      "image": "/instagram-media/17912…",
      "permalink": "https://www.instagram.com/p/…",
      "timestamp": "2026-03-12T18:04:11+0000",
      "mediaType": "IMAGE"
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

## Storage

Twelve images at a time, pruned on each sync as older posts drop out of the
window, so the blob store stays at a few megabytes. Worth a glance at Netlify's
current free-tier Blobs allowance if the post limit is ever raised a lot.
