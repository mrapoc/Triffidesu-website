<?php
// Shared plumbing for the site's two PHP jobs: the programme proxy and the
// Instagram sync. See docs/hosting.md for how these are deployed on 20i.
//
// Layout on the host (the site home is the folder that contains the web root):
//
//   Triffidesu-website/     the web root; this file is <web root>/server/bootstrap.php
//   private/                beside the web root, never served
//     triffid-config.php    secrets, written by hand once (see docs/hosting.md)
//     triffid-state/        tokens and caches the scripts write for themselves
//
// .htaccess refuses every request for /server/, so nothing here is reachable
// except through the rewrites it defines.

declare(strict_types=1);

function triffid_public_dir(): string
{
    return getenv('TRIFFID_PUBLIC_DIR') ?: dirname(__DIR__);
}

function triffid_private_dir(): string
{
    return getenv('TRIFFID_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/private';
}

function triffid_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = triffid_private_dir() . '/triffid-config.php';
        $loaded = is_file($file) ? require $file : [];
        $config = is_array($loaded) ? $loaded : [];
    }
    return $config;
}

// Where the scripts keep what they learn between runs. Created on first use.
function triffid_state_dir(): string
{
    $dir = triffid_private_dir() . '/triffid-state';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create the private state folder');
    }
    return $dir;
}

// Write-then-rename, so a reader never sees half a file and a failed run never
// leaves a truncated one behind.
function triffid_write_atomic(string $path, string $data): void
{
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create $dir");
    }
    $tmp = $dir . '/.' . basename($path) . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $data) !== strlen($data)) {
        @unlink($tmp);
        throw new RuntimeException("Cannot write $path");
    }
    chmod($tmp, 0644);
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException("Cannot replace $path");
    }
}

function triffid_read_json(string $path): ?array
{
    if (!is_file($path)) return null;
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function triffid_write_json(string $path, array $data): void
{
    triffid_write_atomic($path, json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

// One GET with a hard timeout and size cap. Returns [status, content type, body].
// Tests swap the transport by setting $GLOBALS['triffid_http'].
function triffid_http_get(string $url, int $timeout = 15, int $maxBytes = 8388608): array
{
    if (isset($GLOBALS['triffid_http'])) return ($GLOBALS['triffid_http'])($url);

    $body = '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'TriffidExplorers-site/1.0 (+https://www.triffidesu.co.uk/)',
        CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$body, $maxBytes): int {
            $body .= $chunk;
            // Returning short aborts the transfer once it's bigger than we'll accept.
            return strlen($body) > $maxBytes ? 0 : strlen($chunk);
        },
    ]);
    $ok = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = curl_error($ch);

    if ($ok === false) throw new RuntimeException('Request failed: ' . ($error ?: 'unknown error'));
    return [$status, $type, $body];
}
