<?php
// Local dev only: php -S 127.0.0.1:8080 server/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($path, '/api/') === 0) {
    require __DIR__ . '/api/index.php';
    return true;
}
// Serve uploads from server/uploads (the built-in server's docroot is wherever it was started).
if (preg_match('#^/uploads/[a-z0-9_-]+/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$#', $path) && is_file(__DIR__ . $path)) {
    $types = array('png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif');
    header('Content-Type: ' . $types[strtolower(pathinfo($path, PATHINFO_EXTENSION))]);
    readfile(__DIR__ . $path);
    return true;
}
http_response_code(404);
echo 'dev api server';
