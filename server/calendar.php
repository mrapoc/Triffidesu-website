<?php
// GET /api/calendar: our Online Scout Manager programme as iCal.
//
// The browser can't read OSM directly (no CORS), so this relays it. A copy is
// kept for an hour, which means OSM sees at most one request an hour however
// busy the site is, and if OSM is down the last good copy is served instead.

declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

const CALENDAR_URL = 'https://www.onlinescoutmanager.co.uk/ext/cal/?f=308716.NzM0YWQxYmU1YmI4YWVmZjg3NTdkMTc1NjdkMDI4MTdkZTBhNzU1YjRkNzFlZGJiOTFhNzYwMjk0NDMyNDg1NGQzNTY2NmFlZTUzODY2MWVhNDg2OGVjZjJlNjllZjZlMmQ4NmM0ZGJkNzM4YzgzMzAwMzgwOGQxYjc5MzVhYWU%3D.K6K061eQr9';
const CALENDAR_FRESH_FOR = 3600;
const CALENDAR_MAX_BYTES = 2097152;

function calendar_is_ical(string $body): bool
{
    return str_contains($body, 'BEGIN:VCALENDAR');
}

// Returns the iCal text, or null when there is neither a fresh copy nor a stale one.
function calendar_body(?int $now = null): ?string
{
    $now ??= time();
    $cache = triffid_state_dir() . '/calendar.ics';
    $age = is_file($cache) ? $now - (int) filemtime($cache) : PHP_INT_MAX;
    if ($age < CALENDAR_FRESH_FOR) return (string) file_get_contents($cache);

    // One refresh at a time. Anyone arriving mid-refresh gets the stale copy.
    $lock = fopen(triffid_state_dir() . '/calendar.lock', 'c');
    if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
        try {
            [$status, , $body] = triffid_http_get(triffid_config()['calendar_url'] ?? CALENDAR_URL, 10, CALENDAR_MAX_BYTES);
            if ($status === 200 && calendar_is_ical($body)) {
                triffid_write_atomic($cache, $body);
                return $body;
            }
        } catch (Throwable) {
            // Fall through to whatever we already have.
        } finally {
            flock($lock, LOCK_UN);
        }
    }

    return is_file($cache) ? (string) file_get_contents($cache) : null;
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    ini_set('display_errors', '0');
    $body = null;
    try {
        $body = calendar_body();
    } catch (Throwable) {
    }

    if ($body === null) {
        http_response_code(502);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Programme unavailable';
        return;
    }

    header('Content-Type: text/calendar; charset=utf-8');
    header('Cache-Control: public, max-age=900');
    header('X-Robots-Tag: noindex');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo $body;
}
