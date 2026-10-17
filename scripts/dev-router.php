<?php
// Local stand-in for hosting/htaccess, for PHP's built-in server:
//
//   npm run build
//   node scripts/php.mjs -S 127.0.0.1:8080 -t dist scripts/dev-router.php
//
// Covers the routes that matter for checking pages: the calendar endpoint,
// blocked server files, news addresses and error pages. Headers and caching
// are Apache's job and are only proven on 20i itself.

$root = $_SERVER['DOCUMENT_ROOT'];
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

if ($path === '/api/calendar') {
    $_SERVER['SCRIPT_FILENAME'] = realpath("$root/server/calendar.php");
    require $_SERVER['SCRIPT_FILENAME'];
    return true;
}
if ($path === '/news') {
    header('Location: /news/', true, 301);
    return true;
}

$file = $root . $path;
$missing = !is_file($file) && !is_file(rtrim($file, '/') . '/index.html');
if (str_starts_with($path, '/server/') || $missing) {
    http_response_code(preg_match('#^/news/.+\.html$#', $path) ? 410 : 404);
    readfile("$root/404.html");
    return true;
}
return false;
