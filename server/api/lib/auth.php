<?php
/**
 * Sessions, CSRF, current member and guards.
 */

function start_session()
{
    $dir = PRIVATE_DIR . '/sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    ini_set('session.save_path', $dir);
    ini_set('session.gc_maxlifetime', '2592000');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('bba_sid');
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params(array(
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ));
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = rand_hex(24);
    }
}

/** Re-issue the session cookie with a 30-day lifetime (Keep me signed in). */
function persist_session_cookie($remember)
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(session_name(), session_id(), array(
        'expires' => $remember ? time() + 2592000 : 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ));
}

function check_csrf()
{
    $sent = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (!$sent || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
        fail('csrf', 'Your session expired. Please refresh the page and try again.', 419);
    }
}

/** The logged-in, approved member — or null. */
function current_member($reload = false)
{
    static $me = false;
    if ($me !== false && !$reload) {
        return $me;
    }
    $me = null;
    if (empty($_SESSION['member_id'])) {
        return null;
    }
    $row = one('SELECT * FROM members WHERE id = ?', array((int) $_SESSION['member_id']));
    if (!$row || $row['status'] !== 'approved' || (int) $row['session_version'] !== (int) $_SESSION['session_version']) {
        unset($_SESSION['member_id'], $_SESSION['session_version'], $_SESSION['role']);
        return null;
    }
    $me = $row;
    return $me;
}

function require_member()
{
    $me = current_member();
    if (!$me) {
        fail('unauthenticated', 'Please log in to continue.', 401);
    }
    return $me;
}

function require_admin()
{
    $me = require_member();
    if ($me['role'] !== 'admin') {
        fail('forbidden', 'Only admins can do that.', 403);
    }
    return $me;
}

function me_id()
{
    $me = require_member();
    return (int) $me['id'];
}

function is_admin()
{
    $me = current_member();
    return $me && $me['role'] === 'admin';
}

function login_member($row, $remember)
{
    session_regenerate_id(true);
    $_SESSION['member_id'] = (int) $row['id'];
    $_SESSION['session_version'] = (int) $row['session_version'];
    $_SESSION['role'] = $row['role'];
    persist_session_cookie($remember);
    q('UPDATE members SET last_login_at = ? WHERE id = ?', array(now(), $row['id']));
    current_member(true);
}

function logout_session()
{
    $_SESSION = array();
    persist_session_cookie(false);
    session_destroy();
}

/* ------------------------------------------------------------------ */
/* Public member shapes                                                */
/* ------------------------------------------------------------------ */

function photo_url($path)
{
    return $path ? '/' . ltrim($path, '/') : null;
}

/** Fields safe to show to any member (never ITS). */
function member_public($m)
{
    if (!$m) {
        return null;
    }
    return array(
        'id' => (int) $m['id'],
        'full_name' => $m['full_name'],
        'business_name' => $m['business_name'],
        'designation' => $m['designation'],
        'photo_url' => photo_url($m['photo_path']),
        'city' => $m['city'],
        'category' => isset($m['category_name']) ? $m['category_name'] : null,
    );
}

function member_mini_by_id($id)
{
    $m = one('SELECT m.*, c.name AS category_name FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?', array($id));
    return member_public($m);
}

function me_payload($m)
{
    $cat = $m['category_id'] ? val('SELECT name FROM categories WHERE id = ?', array($m['category_id'])) : null;
    return array(
        'id' => (int) $m['id'],
        'role' => $m['role'],
        'full_name' => $m['full_name'],
        'email' => $m['email'],
        'mobile' => $m['mobile'],
        'photo_url' => photo_url($m['photo_path']),
        'business_name' => $m['business_name'],
        'category_id' => $m['category_id'] ? (int) $m['category_id'] : null,
        'category' => $cat,
        'category_other' => $m['category_other'],
        'designation' => $m['designation'],
        'business_description' => $m['business_description'],
        'address' => $m['address'],
        'city' => $m['city'],
        'website' => $m['website'],
        'instagram' => $m['instagram'],
        'linkedin' => $m['linkedin'],
        'facebook' => $m['facebook'],
        'offers' => split_tags($m['offers']),
        'looking_for' => split_tags($m['looking_for']),
        'must_change_password' => (bool) $m['must_change_password'],
        'created_at' => $m['created_at'],
    );
}

function split_tags($s)
{
    if (!$s) {
        return array();
    }
    $out = array();
    foreach (explode(',', $s) as $t) {
        $t = trim($t);
        if ($t !== '') {
            $out[] = $t;
        }
    }
    return $out;
}

/* ------------------------------------------------------------------ */
/* Audit + notifications                                               */
/* ------------------------------------------------------------------ */

function audit($action, $entity, $entityId = null, $before = null, $after = null, $actorId = null)
{
    if ($actorId === null) {
        $me = current_member();
        $actorId = $me ? (int) $me['id'] : null;
    }
    insert('audit_logs', array(
        'actor_id' => $actorId,
        'action' => $action,
        'entity' => $entity,
        'entity_id' => $entityId,
        'before_json' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
        'after_json' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE),
        'ip' => client_ip(),
    ));
}

/** Only the keys that changed, for a compact before/after audit diff. */
function diff_pair($before, $after)
{
    $b = array();
    $a = array();
    foreach ($after as $k => $v) {
        $old = array_key_exists($k, $before) ? $before[$k] : null;
        if ((string) $old !== (string) $v) {
            $b[$k] = $old;
            $a[$k] = $v;
        }
    }
    return array($b, $a);
}

function notify($memberId, $type, $title, $body = null, $link = null)
{
    if (!$memberId) {
        return;
    }
    insert('notifications', array(
        'member_id' => (int) $memberId,
        'type' => $type,
        'title' => mb_substr($title, 0, 250),
        'body' => $body,
        'link' => $link,
    ));
}

function notify_admins($type, $title, $body = null, $link = null, $exceptId = null)
{
    foreach (all("SELECT id FROM members WHERE role = 'admin' AND status = 'approved'") as $a) {
        if ((int) $a['id'] !== (int) $exceptId) {
            notify($a['id'], $type, $title, $body, $link);
        }
    }
}

function first_name($full)
{
    $parts = preg_split('/\s+/', trim((string) $full));
    return $parts ? $parts[0] : $full;
}

/** Load an approved member by id or fail with a field error. */
function approved_member_or_fail($id, $field, $selfId = null, $selfMsg = 'You cannot pick yourself.')
{
    $m = $id ? one("SELECT * FROM members WHERE id = ? AND status = 'approved' AND role = 'member'", array((int) $id)) : null;
    if (!$m) {
        fail('validation', 'Pick a member from the list.', 422, array($field => 'Pick a member from the list.'));
    }
    if ($selfId !== null && (int) $m['id'] === (int) $selfId) {
        fail('validation', $selfMsg, 422, array($field => $selfMsg));
    }
    return $m;
}
