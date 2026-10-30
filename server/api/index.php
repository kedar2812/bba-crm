<?php
/**
 * BBA Networking API — single front controller.
 * GET + POST only (modsecurity on the host blocks PUT/PATCH/DELETE).
 */

define('API_ROOT', __DIR__);
define('PRIVATE_DIR', __DIR__ . '/_private');

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (!is_dir(PRIVATE_DIR . '/logs')) {
    @mkdir(PRIVATE_DIR . '/logs', 0755, true);
}
ini_set('error_log', PRIVATE_DIR . '/logs/php-error.log');
date_default_timezone_set('Asia/Kolkata');
mb_internal_encoding('UTF-8');

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/schema.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/mail.php';
require __DIR__ . '/lib/otp.php';
require __DIR__ . '/lib/uploads.php';
require __DIR__ . '/lib/periods.php';

$ROUTES = array('GET' => array(), 'POST' => array());

/** Register a route. $opts: public (no login), csrf (default true for POST). */
function route($method, $path, $handler, $opts = array())
{
    global $ROUTES;
    $ROUTES[$method][$path] = array($handler, $opts);
}

foreach (glob(__DIR__ . '/routes/*.php') as $file) {
    require $file;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $pos = strpos($uri, '/api/');
    $path = $pos === false ? '' : trim(substr($uri, $pos + 5), '/');

    // CORS for the public landing page on the main domain (read-only public endpoints).
    if (strpos($path, 'public/') === 0 && isset($_SERVER['HTTP_ORIGIN'])) {
        $origin = $_SERVER['HTTP_ORIGIN'];
        if (in_array($origin, (array) config('CORS_ORIGINS', array()), true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            // The app's fetch() always sends credentials; without this the browser drops the response.
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
    }
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (!isset($ROUTES[$method])) {
        fail('method', 'Method not allowed.', 405);
    }
    if (!isset($ROUTES[$method][$path])) {
        fail('not_found', 'Not found.', 404);
    }

    ensure_installed();

    $handler = $ROUTES[$method][$path][0];
    $opts = $ROUTES[$method][$path][1];
    $isPublicGet = $method === 'GET' && strpos($path, 'public/') === 0;
    if (!$isPublicGet) {
        start_session();
    }
    if ($method === 'POST' && (!isset($opts['csrf']) || $opts['csrf'])) {
        check_csrf();
    }
    if (empty($opts['public'])) {
        $me = require_member();
        // Admin accounts administer only; the member app's own routes are closed to them.
        if ($me['role'] === 'admin' && preg_match('#^(dashboard|121s|referrals|visitors|members|meetings|testimonials|profile)(/|$)#', $path)) {
            fail('admin_only', 'Admin accounts manage BBA from the admin panel.', 403);
        }
    }
    call_user_func($handler);
    ok(null);
} catch (ApiError $e) {
    $err = array('code' => $e->errCode, 'message' => $e->getMessage());
    if ($e->fields) {
        $err['fields'] = $e->fields;
    }
    send_json(array('ok' => false, 'error' => $err), $e->status);
} catch (Throwable $e) {
    error_log('[' . request_id() . '] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(array('ok' => false, 'error' => array(
        'code' => 'server_error',
        'message' => 'Something went wrong on our side. Please try again. (ref ' . request_id() . ')',
    )), 500);
}
