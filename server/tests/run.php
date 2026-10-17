<?php
// Tests for the calendar relay and the Instagram sync. No network: every HTTP
// request is answered by the fake transport below, and all files are written
// to a temporary folder.
//
//   node scripts/php.mjs server/tests/run.php

declare(strict_types=1);

$root = sys_get_temp_dir() . '/triffid-tests-' . bin2hex(random_bytes(4));
putenv("TRIFFID_PUBLIC_DIR=$root/public_html");
putenv("TRIFFID_PRIVATE_DIR=$root/private");
mkdir("$root/private", 0700, true);
file_put_contents("$root/private/triffid-config.php", "<?php return ['instagram_access_token' => 'EAAtest', 'instagram_user_id' => '42'];");

require __DIR__ . '/../calendar.php';
require __DIR__ . '/../instagram.php';

$failures = 0;
$count = 0;
function check(bool $ok, string $what): void
{
    global $failures, $count;
    $count++;
    if (!$ok) {
        $failures++;
        echo "FAIL: $what\n";
    }
}

// ----- Fake network -----

$requests = [];
$routes = [];
$GLOBALS['triffid_http'] = function (string $url) use (&$requests, &$routes): array {
    $requests[] = $url;
    foreach ($routes as $prefix => $response) {
        if (str_starts_with($url, $prefix)) {
            if ($response instanceof Throwable) throw $response;
            return is_callable($response) ? $response($url) : $response;
        }
    }
    return [404, 'text/plain', 'not found'];
};

function jpeg(int $w, int $h): string
{
    $img = imagecreatetruecolor($w, $h);
    imagefill($img, 0, 0, imagecolorallocate($img, 40, 120, 200));
    ob_start();
    imagejpeg($img);
    return (string) ob_get_clean();
}

// ----- Words -----

check(ig_clean_caption("Great night kayaking!\n\n#kayak #scouts") === 'Great night kayaking!', 'trailing hashtags dropped');
check(ig_title(['caption' => "What a week! ⚜️🏕️\n\nWe had a brilliant week of camp.", 'timestamp' => '2026-08-15T17:24:51+0000']) === 'What a week!', 'title from opening sentence');
check(ig_title(['caption' => '🔥🔥 #camp', 'timestamp' => '2026-08-15T17:24:51+0000']) === 'Triffid Explorers, 15 August 2026', 'emoji-only caption gets dated title');
check(mb_strlen(ig_title(['caption' => str_repeat('Kayaking on the Teme ', 10), 'timestamp' => ''])) <= 71, 'long title truncated');
check(ig_slug(['id' => '1', 'timestamp' => '2026-08-15T17:24:51+0000'], 'What a week!', []) === '2026-08-15-what-a-week', 'slug');
check(ig_slug(['id' => '1', 'timestamp' => '2026-08-15T17:24:51+0000'], 'What a week!', ['2026-08-15-what-a-week' => true]) === '2026-08-15-what-a-week-2', 'slug collision');
check(ig_slug(['id' => '123456789', 'timestamp' => '2026-08-15T17:24:51+0000'], '⚜️', []) === '2026-08-15-456789', 'slug without words');
$html = ig_caption_html("Line one\nline two <b>\n\nThanks @james #camp");
check(str_contains($html, '<p>Line one<br>line two &lt;b&gt;</p>'), 'caption escaped with line breaks');
check(str_contains($html, '<span class="caption-tag">@james</span>') && str_contains($html, '<span class="caption-tag">#camp</span>'), 'tags and mentions marked');

// ----- Calendar -----

$ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Hut night\nEND:VEVENT\nEND:VCALENDAR";
$routes = ['https://www.onlinescoutmanager.co.uk/' => [200, 'text/calendar', $ics]];
check(calendar_body() === $ics, 'calendar fetched');
$requests = [];
check(calendar_body() === $ics && $requests === [], 'calendar served from cache within the hour');
$routes = ['https://www.onlinescoutmanager.co.uk/' => new RuntimeException('down')];
check(calendar_body(time() + 7200) === $ics, 'stale calendar served when OSM is down');
$routes = ['https://www.onlinescoutmanager.co.uk/' => [200, 'text/html', '<html>error page</html>']];
check(calendar_body(time() + 7200) === $ics, 'non-iCal response ignored');
unlink(triffid_state_dir() . '/calendar.ics');
check(calendar_body() === null, 'no calendar at all gives null');

// ----- Instagram sync -----

$template = file_get_contents(__DIR__ . '/../templates/page.html');
check(str_contains($template, '<!--SLOT:head-->') && str_contains($template, '<!--SLOT:main-->'), 'template has slots');

$media = [
    'data' => [
        [
            'id' => '1001', 'caption' => "What a week! ⚜️\n\nCamp in Pembrokeshire with <friends>.\n\n#camp #explorers",
            'media_type' => 'CAROUSEL_ALBUM', 'permalink' => 'https://www.instagram.com/p/AAA/', 'timestamp' => '2026-08-15T17:24:51+0000',
            'children' => ['data' => [
                ['media_type' => 'IMAGE', 'media_url' => 'https://scontent.cdninstagram.com/a.jpg'],
                ['media_type' => 'VIDEO', 'media_url' => 'https://scontent.cdninstagram.com/v.mp4', 'thumbnail_url' => 'https://scontent.cdninstagram.com/b.jpg'],
            ]],
        ],
        [
            'id' => '1002', 'caption' => 'Kayaking on the Teme tonight.', 'media_type' => 'IMAGE',
            'media_url' => 'https://scontent.cdninstagram.com/c.jpg', 'permalink' => 'https://www.instagram.com/p/BBB/', 'timestamp' => '2026-07-01T18:00:00+0000',
        ],
        [
            'id' => '1003', 'caption' => 'Broken photo', 'media_type' => 'IMAGE',
            'media_url' => 'https://scontent.cdninstagram.com/missing.jpg', 'permalink' => 'https://www.instagram.com/p/CCC/', 'timestamp' => '2026-06-01T18:00:00+0000',
        ],
    ],
];
$routes = [
    'https://graph.facebook.com/v25.0/42/media?' => function () use (&$media) {
        return [200, 'application/json', json_encode($media)];
    },
    'https://scontent.cdninstagram.com/a.jpg' => [200, 'image/jpeg', jpeg(1440, 1800)],
    'https://scontent.cdninstagram.com/b.jpg' => [200, 'image/jpeg', jpeg(1080, 1080)],
    'https://scontent.cdninstagram.com/c.jpg' => [200, 'image/jpeg', jpeg(500, 400)],
];

$posts = ig_sync();
$public = triffid_public_dir();
check(count($posts) === 3, 'three posts synced');
check($posts[0]['slug'] === '2026-08-15-what-a-week' && $posts[0]['url'] === '/news/2026-08-15-what-a-week.html', 'post slug and url');
check(count($posts[0]['images']) === 2, 'carousel keeps both slides, video as its cover');
check($posts[0]['images'][0]['width'] === 1080 && $posts[0]['images'][0]['height'] === 1350, 'large photo capped at 1080 with height scaled');
check(str_contains($posts[0]['images'][0]['srcset'], '-320.webp 320w') && str_contains($posts[0]['images'][0]['srcset'], '-1080.webp 1080w'), 'srcset lists widths');
check(is_file("$public/instagram-media/1001-0-320.webp") && is_file("$public/instagram-media/1001-0-1080.webp"), 'photo widths written');
check($posts[1]['images'][0]['width'] === 500 && is_file("$public/instagram-media/1002-0-500.webp") && !is_file("$public/instagram-media/1002-0-640.webp"), 'small photo never enlarged');
check($posts[2]['images'][0]['src'] === 'https://scontent.cdninstagram.com/missing.jpg', 'failed copy falls back to Instagram URL');
check(($GLOBALS['ig_photo_errors'] ?? []) === ['Photo download returned 404'], 'failed copy reports its reason');

$page = file_get_contents("$public/news/2026-08-15-what-a-week.html");
check(str_contains($page, '<h1 class="display-2">What a week!</h1>'), 'post page heading');
check(str_contains($page, '<link rel="canonical" href="https://www.triffidesu.co.uk/news/2026-08-15-what-a-week.html">'), 'post page canonical');
check(str_contains($page, '"@type":"BlogPosting"'), 'post page structured data');
check(str_contains($page, 'Camp in Pembrokeshire with &lt;friends&gt;.') && !str_contains($page, '<friends>'), 'caption escaped on page');
check(str_contains($page, 'fetchpriority="high"') && substr_count($page, 'loading="lazy"') >= 1, 'first photo prioritised, rest lazy');
check(!str_contains($page, 'SLOT:'), 'template slots filled');
$index = file_get_contents("$public/news/index.html");
check(substr_count($index, 'class="news-card"') === 3, 'news index lists every post');
$sitemap = file_get_contents("$public/sitemap-posts.xml");
check(str_contains($sitemap, '<loc>https://www.triffidesu.co.uk/news/2026-07-01-kayaking-on-the-teme-tonight.html</loc><lastmod>2026-07-01</lastmod>'), 'sitemap lists posts');
$feed = triffid_read_json("$public/data/instagram.json");
check(count($feed['posts']) === 3 && isset($feed['syncedAt']), 'feed json written');

// Second run: nothing new to download, captions edited, one post deleted.
$requests = [];
$media['data'][0]['caption'] = 'Edited caption entirely';
array_pop($media['data']);
$media['data'][] = ['id' => '1004', 'caption' => '', 'media_type' => 'IMAGE', 'media_url' => 'https://scontent.cdninstagram.com/c.jpg',
    'permalink' => 'https://www.instagram.com/p/DDD/', 'timestamp' => '2026-05-01T18:00:00+0000'];
$posts = ig_sync();
$downloads = array_filter($requests, fn($u) => str_contains($u, 'cdninstagram'));
check(count($downloads) === 1, 'only the new post\'s photo is downloaded');
check($posts[0]['slug'] === '2026-08-15-what-a-week', 'edited post keeps its address');
check(!is_file("$public/news/" . '2026-06-01-broken-photo.html'), 'deleted post page removed');
check(!file_exists("$public/instagram-media/1003-0-320.webp") && is_file("$public/instagram-media/1004-0-500.webp"), 'media pruned and new post copied');
check($posts[2]['title'] === 'Triffid Explorers, 1 May 2026', 'post with no caption gets a dated title');

// Instagram down: nothing changes.
$before = file_get_contents("$public/data/instagram.json");
$routes['https://graph.facebook.com/'] = [500, 'application/json', '{"error":{"message":"Service unavailable"}}'];
unset($routes['https://graph.facebook.com/v25.0/42/media?']);
try {
    ig_sync();
    check(false, 'sync should throw when Instagram is down');
} catch (RuntimeException $e) {
    check($e->getMessage() === 'Service unavailable', 'Instagram error message surfaced');
}
check(file_get_contents("$public/data/instagram.json") === $before, 'failed sync leaves the feed alone');

// ----- Token refresh -----

// An Instagram Login token we refreshed ourselves takes over from the configured one.
triffid_write_json(ig_token_file(), ['token' => 'IGold', 'refreshedAt' => gmdate('c', time() - 86400), 'expiresAt' => gmdate('c', time() + 86400 * 50)]);
$routes = ['https://graph.instagram.com/refresh_access_token?' => [200, 'application/json', '{"access_token":"IGnew","expires_in":5184000}']];
check(ig_refresh_token() === null, 'token under a week old is left alone');
triffid_write_json(ig_token_file(), ['token' => 'IGold', 'refreshedAt' => gmdate('c', time() - 8 * 86400), 'expiresAt' => gmdate('c', time() + 86400 * 50)]);
check(ig_refresh_token() !== null && ig_active_token()['token'] === 'IGnew', 'week-old token refreshed and stored');

echo "$count checks, $failures failed\n";

// Clean up.
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $file) $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
rmdir($root);

exit($failures ? 1 : 0);
