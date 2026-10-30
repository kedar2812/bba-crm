<?php
// Local dev only: php -S 127.0.0.1:8080 server/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($path, '/api/') === 0) {
    require __DIR__ . '/api/index.php';
    return true;
}
if (strpos($path, '/uploads/') === 0 && is_file(__DIR__ . $path)) {
    return false;
}
http_response_code(404);
echo 'dev api server';
