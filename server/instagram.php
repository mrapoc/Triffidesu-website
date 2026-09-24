<?php
// Instagram Graph API access and the hourly copy of our posts onto the site.
//
// Each sync writes, under public_html:
//
//   data/instagram.json     every post, read by js/main.js for the homepage,
//                           gallery and topic strips
//   instagram-media/        each photo resized to a few widths as WebP
//   news/<slug>.html        one real page per post, so search engines index
//                           our news as if we had blogged it
//   news/index.html         the list of them
//   sitemap-posts.xml       those pages, for search engines
//
// A post deleted on Instagram disappears here on the next sync, page and photos
// included. That matters: it is how a photo gets taken down on request.
//
// Setup and the token options are in docs/instagram-feed.md.

declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

const IG_HOST = 'https://graph.instagram.com';
const FB_HOST = 'https://graph.facebook.com';
const IG_GRAPH_VERSION = 'v25.0';
const IG_SITE = 'https://www.triffidesu.co.uk';
const IG_PROFILE = 'https://www.instagram.com/triffidesu/';

// Deep enough that every activity topic has something recent: about a year.
const IG_DEFAULT_POST_LIMIT = 48;
const IG_MAX_POST_LIMIT = 50;
// Instagram's own ceiling for a carousel.
const IG_MAX_CAROUSEL_IMAGES = 10;
const IG_MAX_IMAGE_BYTES = 8388608;
// Widths each photo is saved at. 1080 is Instagram's own maximum.
const IG_WIDTHS = [320, 480, 640, 800, 1080];
const IG_MEDIA_PATH = '/instagram-media/';

// Instagram Login tokens expire 60 days after their last refresh. Refreshing
// weekly leaves an enormous margin.
const IG_REFRESH_AFTER = 7 * 86400;

const IG_MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';

function ig_post_limit(): int
{
    $configured = (int) (triffid_config()['instagram_post_limit'] ?? 0);
    return $configured < 1 ? IG_DEFAULT_POST_LIMIT : min($configured, IG_MAX_POST_LIMIT);
}

// ===== Token =====
//
// Two kinds of token work, and the token itself says which it is:
//   "EAA…"  Business system user or Page token. graph.facebook.com, never expires.
//   "IG…"   Instagram Login token. graph.instagram.com, lasts 60 days.

function ig_is_instagram_login_token(string $token): bool
{
    return str_starts_with($token, 'IG');
}

function ig_token_file(): string
{
    return triffid_state_dir() . '/instagram-token.json';
}

// The refreshed token we stored wins over the configured one, which is only
// read until the first refresh.
function ig_active_token(): array
{
    $stored = triffid_read_json(ig_token_file());
    if ($stored && !empty($stored['token']) && strtotime($stored['expiresAt'] ?? '') > time()) {
        return ['token' => $stored['token'], 'refreshedAt' => $stored['refreshedAt'] ?? null];
    }
    return ['token' => (string) (triffid_config()['instagram_access_token'] ?? ''), 'refreshedAt' => null];
}

function ig_graph_get(string $url): array
{
    [$status, , $body] = triffid_http_get($url, 20, 4194304);
    $data = json_decode($body, true);
    if ($status !== 200 || !is_array($data)) {
        throw new RuntimeException($data['error']['message'] ?? "Instagram API returned $status");
    }
    return $data;
}

function ig_refresh_token(bool $force = false): ?string
{
    $active = ig_active_token();
    // System user and Page tokens don't expire, so there is nothing to do.
    if ($active['token'] === '' || !ig_is_instagram_login_token($active['token'])) return null;

    // A configured token has never been refreshed by us, so it goes first time.
    // Instagram refuses tokens under a day old; that just fails and retries next hour.
    if (!$force && $active['refreshedAt'] && time() - (int) strtotime($active['refreshedAt']) < IG_REFRESH_AFTER) return null;

    $data = ig_graph_get(IG_HOST . '/refresh_access_token?' . http_build_query([
        'grant_type' => 'ig_refresh_token',
        'access_token' => $active['token'],
    ]));
    if (empty($data['access_token'])) throw new RuntimeException('Token refresh returned no token');

    $expiresAt = gmdate('c', time() + (int) ($data['expires_in'] ?? 60 * 86400));
    triffid_write_json(ig_token_file(), [
        'token' => $data['access_token'],
        'refreshedAt' => gmdate('c'),
        'expiresAt' => $expiresAt,
    ]);
    chmod(ig_token_file(), 0600);
    return $expiresAt;
}

// Which Instagram account to read. A Page token carries the link directly;
// user and system user tokens see a list of Pages, so look for one with
// Instagram attached. Worked out once and remembered.
function ig_user_id(string $token): string
{
    $configured = (string) (triffid_config()['instagram_user_id'] ?? '');
    if ($configured !== '') return $configured;
    if (ig_is_instagram_login_token($token)) return 'me';

    $cacheFile = triffid_state_dir() . '/instagram-user-id.json';
    $cached = triffid_read_json($cacheFile);
    if (!empty($cached['id'])) return (string) $cached['id'];

    $fields = 'name,instagram_business_account{id,username}';
    foreach (['me' => false, 'me/accounts' => true] as $path => $isList) {
        try {
            $data = ig_graph_get(FB_HOST . '/' . IG_GRAPH_VERSION . "/$path?" . http_build_query(['fields' => $fields, 'access_token' => $token]));
        } catch (Throwable) {
            continue;
        }
        foreach ($isList ? ($data['data'] ?? []) : [$data] as $page) {
            $id = $page['instagram_business_account']['id'] ?? null;
            if ($id) {
                triffid_write_json($cacheFile, ['id' => $id, 'username' => $page['instagram_business_account']['username'] ?? '']);
                return (string) $id;
            }
        }
    }

    throw new RuntimeException('No Instagram Business account is linked to a Page this token can see. Check the '
        . 'Instagram account is linked to the Facebook Page and the token has instagram_basic and pages_show_list.');
}

// ===== Posts =====

// A still for one item. Videos and reels only ever give us a cover frame;
// playback stays on Instagram.
function ig_still(array $item): string
{
    return ($item['media_type'] ?? '') === 'VIDEO'
        ? ($item['thumbnail_url'] ?? $item['media_url'] ?? '')
        : ($item['media_url'] ?? $item['thumbnail_url'] ?? '');
}

function ig_normalise(array $post): ?array
{
    if (($post['media_type'] ?? '') === 'CAROUSEL_ALBUM') {
        // Album parents carry no media of their own; it all hangs off the children.
        $images = array_map('ig_still', $post['children']['data'] ?? []);
    } else {
        $images = [ig_still($post)];
    }
    $images = array_slice(array_values(array_filter($images)), 0, IG_MAX_CAROUSEL_IMAGES);
    $caption = trim((string) ($post['caption'] ?? ''));

    if (empty($post['id']) || (!$images && $caption === '')) return null;

    return [
        'id' => (string) $post['id'],
        'caption' => $caption,
        'remoteImages' => $images,
        'permalink' => $post['permalink'] ?? IG_PROFILE,
        'timestamp' => $post['timestamp'] ?? '',
        'mediaType' => $post['media_type'] ?? 'IMAGE',
    ];
}

function ig_fetch_posts(int $limit): array
{
    $active = ig_active_token();
    if ($active['token'] === '') throw new RuntimeException('instagram_access_token is not set in private/triffid-config.php');

    $host = ig_is_instagram_login_token($active['token']) ? IG_HOST : FB_HOST;
    $userId = ig_user_id($active['token']);
    $data = ig_graph_get("$host/" . IG_GRAPH_VERSION . "/$userId/media?" . http_build_query([
        'fields' => IG_MEDIA_FIELDS,
        'limit' => $limit,
        'access_token' => $active['token'],
    ]));

    return array_values(array_filter(array_map('ig_normalise', $data['data'] ?? [])));
}

// ===== Photos =====

function ig_media_dir(): string
{
    return triffid_public_dir() . '/instagram-media';
}

function ig_image_record(array $widths, string $key, string $ext, int $width, int $height): array
{
    $srcset = array_map(fn($w) => IG_MEDIA_PATH . "$key-$w.$ext {$w}w", $widths);
    $largest = end($widths);
    return [
        'src' => IG_MEDIA_PATH . "$key-$largest.$ext",
        'srcset' => implode(', ', $srcset),
        'width' => $width,
        'height' => $height,
    ];
}

// Instagram's own URLs are signed and expire, so hot-linking is only ever a
// stopgap for a photo we failed to copy.
function ig_remote_record(string $url): array
{
    return ['src' => $url, 'srcset' => '', 'width' => 0, 'height' => 0];
}

function ig_is_local(array $record): bool
{
    return str_starts_with($record['src'] ?? '', IG_MEDIA_PATH)
        && is_file(ig_media_dir() . '/' . substr($record['src'], strlen(IG_MEDIA_PATH)));
}

// Downloads one photo and saves it at each width. Returns null on any failure.
function ig_store_image(string $remoteUrl, string $key): ?array
{
    if (!function_exists('imagecreatefromstring')) return null;

    try {
        [$status, $type, $body] = triffid_http_get($remoteUrl, 15, IG_MAX_IMAGE_BYTES);
    } catch (Throwable) {
        return null;
    }
    if ($status !== 200 || !str_starts_with($type, 'image/') || !getimagesizefromstring($body)) return null;

    $source = @imagecreatefromstring($body);
    if (!$source) return null;

    $w = imagesx($source);
    $h = imagesy($source);
    // Every standard width below the original, then the original (capped).
    $widths = array_values(array_unique(array_merge(
        array_filter(IG_WIDTHS, fn($x) => $x < $w),
        [min($w, max(IG_WIDTHS))],
    )));
    $webp = function_exists('imagewebp');
    $ext = $webp ? 'webp' : 'jpg';

    foreach ($widths as $target) {
        $scaled = $target === $w ? $source : imagescale($source, $target, (int) round($h * $target / $w), IMG_BICUBIC);
        if (!$scaled) return null;
        $path = ig_media_dir() . "/$key-$target.$ext";
        $tmp = "$path.tmp";
        $ok = $webp ? imagewebp($scaled, $tmp, 78) : imagejpeg($scaled, $tmp, 80);
        if (!$ok || !rename($tmp, $path)) {
            @unlink($tmp);
            return null;
        }
        chmod($path, 0644);
    }

    $largest = end($widths);
    return ig_image_record($widths, $key, $ext, $largest, (int) round($h * $largest / $w));
}

// Every photo of a post, copied once. A post's photos never change, so what the
// last sync stored is trusted as long as the files are still there.
function ig_images_for(array $post, ?array $previous): array
{
    $old = $previous['images'] ?? [];
    if (count($old) === count($post['remoteImages']) && $old && count(array_filter($old, 'ig_is_local')) === count($old)) {
        return $old;
    }

    $records = [];
    foreach ($post['remoteImages'] as $index => $remote) {
        $records[] = ig_store_image($remote, $post['id'] . '-' . $index) ?? ig_remote_record($remote);
    }
    return $records;
}

// ===== Words =====

function ig_clean_caption(string $caption): string
{
    // A trailing wall of hashtags is Instagram's sign-off, not part of the post.
    $lines = preg_split('/\R/u', $caption);
    while ($lines && preg_match('/^\s*(#[^\s#]+\s*)*$/u', end($lines))) array_pop($lines);
    return trim(implode("\n", $lines));
}

// Words only: no hashtags, mentions, emoji or runs of whitespace.
function ig_plain_text(string $text): string
{
    $text = preg_replace('/(^|\s)[#@][^\s]+/u', ' ', $text);
    $text = preg_replace('/[^\p{L}\p{N}\p{P}\p{Zs}£$€%&+=\n]/u', '', $text);
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    return trim(preg_replace('/\s*\n\s*/u', "\n", $text));
}

function ig_truncate(string $text, int $max): string
{
    if (mb_strlen($text) <= $max) return $text;
    $cut = mb_substr($text, 0, $max);
    $space = mb_strrpos($cut, ' ');
    if ($space !== false && $space > $max * 0.6) $cut = mb_substr($cut, 0, $space);
    return rtrim($cut, " ,;:-") . '…';
}

function ig_date(string $timestamp, string $format = 'j F Y'): string
{
    $time = strtotime($timestamp);
    return $time ? (new DateTimeImmutable('@' . $time))->setTimezone(new DateTimeZone('Europe/London'))->format($format) : '';
}

// A headline from the caption's opening sentence. Captions usually open with
// one ("What a week!"), which reads naturally as a title.
function ig_title(array $post): string
{
    $plain = ig_plain_text(ig_clean_caption($post['caption']));
    foreach (preg_split('/\n/u', $plain) as $line) {
        $line = trim($line);
        if (!preg_match('/\p{L}{3}/u', $line)) continue;
        if (preg_match('/^(.{12,}?[.!?])(\s|$)/u', $line, $m)) $line = $m[1];
        return ig_truncate(rtrim($line, '.'), 70);
    }
    $date = ig_date($post['timestamp']);
    return 'Triffid Explorers' . ($date ? ", $date" : '');
}

function ig_description(array $post, string $title): string
{
    $plain = preg_replace('/\s+/u', ' ', ig_plain_text(ig_clean_caption($post['caption'])));
    if (!preg_match('/\p{L}{3}/u', $plain)) return "$title. News from Triffid Explorer Scouts in Ludlow, Shropshire.";
    return ig_truncate($plain, 155);
}

function ig_slug(array $post, string $title, array $taken): string
{
    $words = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: ''), '-'));
    $words = implode('-', array_slice(array_filter(explode('-', $words)), 0, 7));
    $base = ig_date($post['timestamp'], 'Y-m-d') ?: 'post';
    $slug = $words !== '' ? "$base-$words" : "$base-" . substr($post['id'], -6);
    for ($n = 2, $candidate = $slug; isset($taken[$candidate]); $n++) $candidate = "$slug-$n";
    return $candidate;
}

function ig_h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

// Instagram captions are plain text with meaning carried by line breaks. The
// same treatment as renderCaption() in js/main.js.
function ig_caption_html(string $caption): string
{
    $text = ig_clean_caption($caption);
    $html = '';
    foreach (preg_split('/\n\s*\n/u', $text) as $para) {
        $para = trim($para);
        if ($para === '') continue;
        $para = preg_replace('/(^|\s)(#[\wÀ-ɏ]+)/u', '$1<span class="caption-tag">$2</span>', ig_h($para));
        $para = preg_replace('/(^|\s)(@[\w.]+)/u', '$1<span class="caption-tag">$2</span>', $para);
        $html .= '<p>' . str_replace("\n", '<br>', $para) . "</p>\n";
    }
    return $html;
}

function ig_alt(array $post, string $fallback): string
{
    $plain = preg_replace('/\s+/u', ' ', ig_plain_text(ig_clean_caption($post['caption'])));
    return preg_match('/\p{L}{3}/u', $plain) ? ig_truncate($plain, 100) : $fallback;
}

// ===== Pages =====

function ig_img(array $image, string $alt, string $sizes, bool $lead = false): string
{
    $attrs = ['src' => $image['src']];
    if ($image['srcset'] !== '') $attrs['srcset'] = $image['srcset'];
    if ($image['srcset'] !== '') $attrs['sizes'] = $sizes;
    if ($image['width']) {
        $attrs['width'] = (string) $image['width'];
        $attrs['height'] = (string) $image['height'];
    }
    $attrs['alt'] = $alt;
    if ($lead) {
        $attrs['fetchpriority'] = 'high';
    } else {
        $attrs['loading'] = 'lazy';
    }
    $attrs['decoding'] = 'async';

    $html = '<img';
    foreach ($attrs as $name => $value) $html .= ' ' . $name . '="' . ig_h($value) . '"';
    $html .= '>';
    if ($lead) return $html;

    // Held back until first paint, like every lazy photo in the built pages
    // (scripts/build.mjs, js/main.js), with a <noscript> copy.
    return preg_replace('/\s(src|srcset)="/', ' data-$1="', $html) . '<noscript>' . $html . '</noscript>';
}

function ig_absolute(string $src): string
{
    return str_starts_with($src, '/') ? IG_SITE . $src : $src;
}

function ig_template(): string
{
    $template = @file_get_contents(__DIR__ . '/templates/page.html');
    if (!$template || !str_contains($template, '<!--SLOT:head-->') || !str_contains($template, '<!--SLOT:main-->')) {
        throw new RuntimeException('Page template missing or damaged');
    }
    return $template;
}

function ig_fill(string $template, string $head, string $main): string
{
    return str_replace(['<!--SLOT:head-->', '<!--SLOT:main-->'], [$head, $main], $template);
}

function ig_json_ld(array $data): string
{
    return '<script type="application/ld+json">' . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) . '</script>';
}

const IG_POST_SIZES = '(min-width: 800px) 720px, calc(100vw - 40px)';
const IG_GRID_SIZES = '(min-width: 800px) 354px, calc(50vw - 26px)';
const IG_CARD_SIZES = '(min-width: 1180px) 350px, (min-width: 760px) 45vw, calc(100vw - 40px)';

function ig_post_page(string $template, array $post, ?array $newer, ?array $older): string
{
    $url = IG_SITE . $post['url'];
    $date = ig_date($post['timestamp']);
    $lead = $post['images'][0] ?? null;

    $head = '<title>' . ig_h($post['title']) . ' | Triffid Explorer Scouts</title>'
        . '<meta name="description" content="' . ig_h($post['description']) . '">'
        . '<link rel="canonical" href="' . ig_h($url) . '">'
        . '<meta property="og:title" content="' . ig_h($post['title']) . '">'
        . '<meta property="og:description" content="' . ig_h($post['description']) . '">'
        . '<meta property="og:url" content="' . ig_h($url) . '">'
        . '<meta property="og:type" content="article">'
        . '<meta property="og:locale" content="en_GB">'
        . '<meta property="og:site_name" content="Triffid Explorer Scouts">'
        . '<meta property="article:published_time" content="' . ig_h($post['timestamp']) . '">'
        . ($lead ? '<meta property="og:image" content="' . ig_h(ig_absolute($lead['src'])) . '">' : '')
        . ig_json_ld([
            '@context' => 'https://schema.org',
            '@graph' => [
                [
                    '@type' => 'BlogPosting',
                    'headline' => $post['title'],
                    'description' => $post['description'],
                    'datePublished' => $post['timestamp'],
                    'url' => $url,
                    'mainEntityOfPage' => $url,
                    'image' => array_map(fn($i) => ig_absolute($i['src']), $post['images']),
                    'author' => ['@id' => IG_SITE . '/#organization'],
                    'publisher' => ['@id' => IG_SITE . '/#organization'],
                    'sameAs' => $post['permalink'],
                ],
                [
                    '@type' => 'BreadcrumbList',
                    'itemListElement' => [
                        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => IG_SITE . '/'],
                        ['@type' => 'ListItem', 'position' => 2, 'name' => 'News', 'item' => IG_SITE . '/news/'],
                        ['@type' => 'ListItem', 'position' => 3, 'name' => $post['title'], 'item' => $url],
                    ],
                ],
            ],
        ]);

    // The lead photo, then the words, then the rest of a carousel as a grid, so
    // a ten-photo post doesn't bury its story below ten screens of pictures.
    $count = count($post['images']);
    $leadPhoto = $lead ? ig_img($lead, ig_alt($post, $post['title']), IG_POST_SIZES, true) : '';
    $morePhotos = '';
    foreach (array_slice($post['images'], 1) as $i => $image) {
        $morePhotos .= ig_img($image, 'Photo ' . ($i + 2) . " of $count: " . $post['title'], IG_GRID_SIZES);
    }

    $pager = '';
    if ($newer) $pager .= '<a class="news-pager-link" href="' . ig_h($newer['url']) . '"><span>Newer</span>' . ig_h($newer['title']) . '</a>';
    if ($older) $pager .= '<a class="news-pager-link is-older" href="' . ig_h($older['url']) . '"><span>Older</span>' . ig_h($older['title']) . '</a>';

    $main = '<main id="main"><article class="section news-article"><div class="container container-narrow">'
        . '<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/news/">News</a></li></ol></nav>'
        . '<header class="section-header">'
        . ($date ? '<p class="eyebrow"><time datetime="' . ig_h($post['timestamp']) . '">' . ig_h($date) . '</time></p>' : '')
        . '<span class="necker-rule" aria-hidden="true"></span>'
        . '<h1 class="display-2">' . ig_h($post['title']) . '</h1>'
        . '</header>'
        . ($leadPhoto ? '<div class="news-lead">' . $leadPhoto . '</div>' : '')
        . '<div class="prose post-caption news-caption">' . ig_caption_html($post['caption']) . '</div>'
        . ($morePhotos ? '<div class="news-photos">' . $morePhotos . '</div>' : '')
        . '<div class="news-actions">'
        . '<a class="btn" href="mailto:hello@triffidesu.co.uk?subject=Arranging%20a%20first%20visit%20to%20Triffid%20Explorers">Arrange a visit <span class="arrow" aria-hidden="true">&rarr;</span></a>'
        . '<a class="lightbox-source" href="' . ig_h($post['permalink']) . '" target="_blank" rel="noopener noreferrer">View on Instagram</a>'
        . '</div>'
        . '<nav class="news-more" aria-labelledby="news-more-heading">'
        . '<h2 id="news-more-heading" class="news-more-heading">More news</h2>'
        . ($pager ? '<div class="news-pager">' . $pager . '</div>' : '')
        . '<p><a href="/news/">All our news</a></p>'
        . '</nav>'
        . '</div></article></main>';

    return ig_fill($template, $head, $main);
}

function ig_index_page(string $template, array $posts): string
{
    $url = IG_SITE . '/news/';
    $title = 'News from Triffid Explorer Scouts in Ludlow';
    $description = 'What Ludlow\'s Explorer Scouts have been up to: camps, expeditions, kayaking, climbing and community service, straight from our Instagram.';

    $head = '<title>' . ig_h($title) . '</title>'
        . '<meta name="description" content="' . ig_h($description) . '">'
        . '<link rel="canonical" href="' . ig_h($url) . '">'
        . '<meta property="og:title" content="' . ig_h($title) . '">'
        . '<meta property="og:description" content="' . ig_h($description) . '">'
        . '<meta property="og:url" content="' . ig_h($url) . '">'
        . '<meta property="og:type" content="website">'
        . '<meta property="og:locale" content="en_GB">'
        . '<meta property="og:site_name" content="Triffid Explorer Scouts">'
        . '<meta property="og:image" content="' . IG_SITE . '/images/og-image.jpg">'
        . ig_json_ld([
            '@context' => 'https://schema.org',
            '@type' => 'Blog',
            'name' => $title,
            'url' => $url,
            'publisher' => ['@id' => IG_SITE . '/#organization'],
            'blogPost' => array_map(fn($p) => [
                '@type' => 'BlogPosting',
                'headline' => $p['title'],
                'datePublished' => $p['timestamp'],
                'url' => IG_SITE . $p['url'],
            ], $posts),
        ]);

    $cards = '';
    foreach ($posts as $i => $post) {
        $image = $post['images'][0] ?? null;
        $date = ig_date($post['timestamp']);
        $cards .= '<li><a class="news-card" href="' . ig_h($post['url']) . '">'
            . ($image ? '<span class="news-card-media">' . ig_img($image, '', IG_CARD_SIZES, $i === 0) . '</span>' : '')
            . '<span class="news-card-body">'
            . ($date ? '<time class="news-card-date" datetime="' . ig_h($post['timestamp']) . '">' . ig_h($date) . '</time>' : '')
            . '<h2 class="news-card-title">' . ig_h($post['title']) . '</h2>'
            . '</span></a></li>';
    }

    $main = '<main id="main"><section class="section"><div class="container">'
        . '<div class="section-header">'
        . '<span class="eyebrow">News</span>'
        . '<span class="necker-rule" aria-hidden="true"></span>'
        . '<h1 class="display-2">What we\'ve been up to</h1>'
        . '<p class="lede">Camps, expeditions, evenings at the hut and days out, as they happen. Every post here comes straight from <a href="' . IG_PROFILE . '" target="_blank" rel="noopener noreferrer">our Instagram</a>.</p>'
        . '</div>'
        . '<ul class="news-list">' . $cards . '</ul>'
        . '</div></section></main>';

    return ig_fill($template, $head, $main);
}

function ig_sitemap(array $posts): string
{
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    $newest = $posts ? ig_date($posts[0]['timestamp'], 'Y-m-d') : gmdate('Y-m-d');
    $xml .= '  <url><loc>' . IG_SITE . "/news/</loc><lastmod>$newest</lastmod></url>\n";
    foreach ($posts as $post) {
        $xml .= '  <url><loc>' . ig_h(IG_SITE . $post['url']) . '</loc><lastmod>' . ig_date($post['timestamp'], 'Y-m-d') . "</lastmod></url>\n";
    }
    return $xml . "</urlset>\n";
}

// ===== The sync =====

function ig_feed_file(): string
{
    return triffid_public_dir() . '/data/instagram.json';
}

// Removes photos and pages for posts that are no longer on Instagram (or have
// aged out of the window). Only ever called with a real, non-empty sync.
function ig_prune(array $posts): void
{
    $keepMedia = [];
    $keepPages = ['index.html' => true];
    foreach ($posts as $post) {
        $keepPages[basename($post['url'])] = true;
        foreach ($post['images'] as $i => $image) $keepMedia[$post['id'] . '-' . $i] = true;
    }

    foreach (glob(ig_media_dir() . '/*') ?: [] as $file) {
        $key = preg_match('/^(\d+-\d+)-\d+\.(webp|jpg)$/', basename($file), $m) ? $m[1] : null;
        if ($key === null || !isset($keepMedia[$key])) @unlink($file);
    }
    foreach (glob(triffid_public_dir() . '/news/*.html') ?: [] as $file) {
        if (!isset($keepPages[basename($file)])) @unlink($file);
    }
}

// Pulls the latest posts, copies anything new, and rewrites the feed, pages and
// sitemap. Throws before touching anything if Instagram can't be reached, so
// the site keeps the last good copy.
function ig_sync(?array $fetched = null): array
{
    $fetched ??= ig_fetch_posts(ig_post_limit());
    if (!$fetched) throw new RuntimeException('Instagram returned no posts');
    $template = ig_template();

    if (!is_dir(ig_media_dir()) && !mkdir(ig_media_dir(), 0755, true) && !is_dir(ig_media_dir())) {
        throw new RuntimeException('Cannot create instagram-media');
    }

    $previous = [];
    foreach (triffid_read_json(ig_feed_file())['posts'] ?? [] as $old) $previous[$old['id']] = $old;

    $posts = [];
    $taken = [];
    foreach ($fetched as $post) {
        $old = $previous[$post['id']] ?? null;
        $title = ig_title($post);
        // A post keeps its address even if its caption is edited later.
        $slug = $old['slug'] ?? ig_slug($post, $title, $taken);
        $taken[$slug] = true;
        $images = ig_images_for($post, $old);

        $posts[] = [
            'id' => $post['id'],
            'slug' => $slug,
            'url' => "/news/$slug.html",
            'title' => $title,
            'description' => ig_description($post, $title),
            'caption' => $post['caption'],
            'image' => $images[0] ?? null,
            'images' => $images,
            'permalink' => $post['permalink'],
            'timestamp' => $post['timestamp'],
            'mediaType' => $post['mediaType'],
        ];
    }

    // Pages first, so every link in the feed points at a page that exists.
    $news = triffid_public_dir() . '/news';
    foreach ($posts as $i => $post) {
        triffid_write_atomic("$news/{$post['slug']}.html", ig_post_page($template, $post, $posts[$i - 1] ?? null, $posts[$i + 1] ?? null));
    }
    triffid_write_atomic("$news/index.html", ig_index_page($template, $posts));
    triffid_write_atomic(triffid_public_dir() . '/sitemap-posts.xml', ig_sitemap($posts));
    triffid_write_json(ig_feed_file(), ['syncedAt' => gmdate('c'), 'posts' => $posts]);

    ig_prune($posts);
    return $posts;
}
