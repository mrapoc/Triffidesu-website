<?php
// Hourly job: copy our latest Instagram posts onto the site.
//
// Run by a 20i Scheduled Task (docs/hosting.md), never over the web:
//
//   php /home/sites/<package>/public_html/server/instagram-sync.php
//
// On failure it changes nothing, so the site keeps the last good copy, and the
// reason is written to private/triffid-state/instagram-status.json.

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/instagram.php';

$status = triffid_read_json(triffid_state_dir() . '/instagram-status.json') ?? [];

try {
    $posts = ig_sync();
    $status['lastSuccess'] = gmdate('c');
    $status['posts'] = count($posts);
    unset($status['lastError'], $status['lastErrorAt']);
    echo 'Instagram sync: stored ' . count($posts) . " posts.\n";
    $exit = 0;
} catch (Throwable $e) {
    $status['lastError'] = $e->getMessage();
    $status['lastErrorAt'] = gmdate('c');
    fwrite(STDERR, 'Instagram sync failed, keeping the previous copy: ' . $e->getMessage() . "\n");
    $exit = 1;
}

unset($status['tokenRefreshError']);

// Keep a lapsing Instagram Login token alive. Separate from the sync so a bad
// hour at Instagram doesn't also cost us the refresh.
try {
    ig_refresh_token();
} catch (Throwable $e) {
    $status['tokenRefreshError'] = $e->getMessage();
}

triffid_write_json(triffid_state_dir() . '/instagram-status.json', $status);
exit($exit);
