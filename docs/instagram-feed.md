# Instagram feed setup

The **Latest News** and **Latest Adventures** sections on the homepage are pulled
straight from our Instagram account. Post to Instagram and the site catches up on
its own — no code changes, no re-deploy.

## How it works

1. `netlify/functions/instagram.js` asks the Instagram Graph API for our twelve
   most recent posts and returns them as JSON. The access token never leaves the
   server.
2. `js/main.js` fetches that JSON. The newest post becomes the featured **Latest
   News** card; the next eight fill the **Latest Adventures** grid.
3. The response is cached for 30 minutes, so a new post appears on the site
   within half an hour.
4. If anything goes wrong, the page falls back to the hand-written news card in
   `index.html` and a "View our Instagram" button. The site never shows an empty
   section.

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

## Keeping the token alive

Instagram long-lived tokens expire after 60 days. A lapsed token is the usual
reason a feed like this quietly stops updating, so it's refreshed automatically
in two places:

- `netlify/functions/instagram.js` tops the token up whenever it's more than a
  week old and someone visits the site.
- `netlify/functions/instagram-refresh.js` is a scheduled function that does the
  same every Monday at 04:00 UTC, covering quiet spells with no traffic.

Refreshed tokens are stored in Netlify Blobs (store `social`, key
`instagram-token`) and take precedence over the environment variable. The
variable is only used until the first successful refresh, so there's no need to
keep updating it by hand.

If the token is ever revoked — say the Instagram password changes, or the app's
permissions are removed — generate a fresh one and update
`INSTAGRAM_ACCESS_TOKEN`, then delete the `instagram-token` blob (Netlify UI:
**Blobs → social**) so the new variable is picked up.

## Checking it works

Visit `https://triffidesu.co.uk/.netlify/functions/instagram`. A healthy response
looks like:

```json
{ "posts": [ { "id": "…", "caption": "…", "image": "https://…", "permalink": "https://www.instagram.com/p/…", "timestamp": "2026-03-12T18:04:11+0000", "mediaType": "IMAGE" } ], "fetchedAt": "…" }
```

A `502` with an `error` field means the token is missing, expired, or lacks the
right permission — the message says which.
