# Hosting on 20i

The site runs on 20i shared Linux hosting, the same kind of package as
fresh-tech.uk. It is plain HTML plus two small PHP jobs; there is no database.

| What | How it runs | Source |
| --- | --- | --- |
| Pages, images, fonts, script | Static files served by Apache | repo root, built by `npm run build` |
| Programme (OSM calendar) | `/api/calendar`, a PHP relay that keeps an hour-old copy | `server/calendar.php` |
| Instagram posts | Hourly 20i Scheduled Task writes the feed, photos and news pages | `server/instagram-sync.php`, `server/instagram.php` |
| Addresses, headers, caching | `.htaccess` | `hosting/htaccess` |

## Build an upload

Normally nobody does this: a push to `main` publishes through GitHub Actions
and 20i's Git clone (docs/publishing.md). The zip is the fallback if that is unavailable.

```powershell
npm test
npm run package
```

That writes `dist/` and zips it as `release/triffidesu-site.zip`. The zip holds
the whole of `public_html` except what the Instagram sync writes on the server:
`data/`, `instagram-media/`, `news/` and `sitemap-posts.xml`. Extracting a new
zip over the site never touches those, so posts survive every upload.

To preview locally with the PHP endpoints working:

```powershell
node scripts/php.mjs -S 127.0.0.1:8080 -t dist scripts/dev-router.php
```

## First-time setup on 20i

Do all of this before moving DNS. 20i gives each package a temporary preview
address to check it on.

1. **Package.** In My20i, add a Linux hosting package for `triffidesu.co.uk`
   with `www.triffidesu.co.uk` as an alias. PHP version: 8.4 (anything 8.2 or
   later works; the scripts need the standard `curl`, `gd` and `mbstring`
   extensions, which 20i enables by default).
2. **Upload.** File Manager, open `public_html`, delete the placeholder
   `index.html`, upload `release/triffidesu-site.zip`, extract it there, then
   delete the zip. Check `.htaccess` is present (show hidden files).
3. **Private folder.** In the package home (the folder *containing*
   `public_html`), create `private/`. Inside it create `triffid-config.php` from
   `hosting/triffid-config.example.php` and paste in the Instagram token. The
   current token is the `INSTAGRAM_ACCESS_TOKEN` environment variable in Netlify
   (Site configuration, Environment variables). Permissions: `private/` 0700,
   the config file 0600.
4. **Scheduled Task.** My20i, Scheduled Tasks, add:
   `/usr/bin/php85 /home/sites/<package folder>/Triffidesu-website/server/instagram-sync.php`
   to run every hour. Pick the same PHP version as the site. File Manager shows
   the real path at the top when you open `public_html`.
5. **First sync.** Wait for the first run (up to an hour), then check
   `private/triffid-state/instagram-status.json` shows `lastSuccess` and
   `public_html/news/` has pages in it. The first run copies every photo, so it
   takes a minute or two; later runs only fetch new posts.
6. **Force HTTPS.** Turn on 20i's Force HTTPS for the package. Do not add an
   HTTPS rule to `.htaccess` as well: 20i says two HTTPS redirects cause loops.

## Moving DNS

DNS is at Cloudflare. Email for `hello@triffidesu.co.uk` is Cloudflare Email
Routing (the MX and SPF records) and is not affected by any of this.

1. In Cloudflare DNS, change the two web records to the addresses 20i shows for
   the package (DNS, "Point your domain"): the `triffidesu.co.uk` A record
   (currently Netlify's `75.2.60.5`) and `www` (currently a CNAME to
   `effervescent-cat-9fd130.netlify.app`). Leave them DNS-only (grey cloud),
   as they are now.
2. Once they resolve to 20i, issue the free SSL certificate in My20i for both
   names. Until it is issued browsers show a certificate warning, so do this
   straight away.
3. Check the site (below). Then, and only then, delete the Netlify site. The
   old Netlify Blobs copy of the Instagram photos goes with it; the 20i sync has
   its own.

## Checking a deployment

```powershell
npm run verify:live
npm run verify:live -- https://<20i preview address>
```

This reads the live site (GET/HEAD only, nothing submitted) and checks the
pages, redirects, headers, the calendar relay, the Instagram feed and news
pages, and that `/server/` is unreachable. It exits non-zero on any failure.
Then run PageSpeed Insights on the homepage and a news page.

## Where things are on the server

```
<package home>/
  private/
    triffid-config.php        token (written by hand)
    triffid-state/            written by the scripts
      instagram-status.json   last sync result or error
      instagram-token.json    refreshed Instagram Login token, if that kind
      calendar.ics            last good copy of the OSM programme
  Triffidesu-website/         the web root: 20i's Git clone of the live
                              branch, plus data/, instagram-media/, news/,
                              sitemap-posts.xml from the sync
  public_html/                old web root, no longer served
```

To take a photo down, delete the post on Instagram. The next hourly sync
removes its page and every copy of its photos, and the old page address
answers 410 Gone so search engines drop it.
