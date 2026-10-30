<?php

route('GET', 'public/stats', function () {
    $cacheFile = PRIVATE_DIR . '/cache/public-stats.json';
    if (is_file($cacheFile) && filemtime($cacheFile) > time() - 600) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            ok($cached);
        }
    }
    $data = array(
        'members' => (int) val("SELECT COUNT(*) FROM members WHERE status = 'approved' AND role = 'member'"),
        'business' => (float) val("SELECT COALESCE(SUM(final_value), 0) FROM referrals WHERE status = 'won' AND " . LIVE_REF),
        'ones' => (int) val("SELECT COUNT(*) FROM one_to_ones WHERE status = 'completed'"),
        'referrals' => (int) val("SELECT COUNT(*) FROM referrals WHERE type = 'referral' AND " . LIVE_REF),
    );
    if (!is_dir(dirname($cacheFile))) {
        @mkdir(dirname($cacheFile), 0755, true);
    }
    @file_put_contents($cacheFile, json_encode($data));
    ok($data);
}, array('public' => true));

route('GET', 'public/content', function () {
    $s = settings_all();
    $keys = array('hero_sub', 'about', 'contact_email', 'contact_phone', 'contact_address', 'instagram_handle');
    $out = array();
    foreach ($keys as $k) {
        $out[$k] = isset($s[$k]) ? (string) $s[$k] : '';
    }
    $next = one('SELECT id, title, meeting_date, start_time, venue, online_link FROM meetings WHERE meeting_date >= ? ORDER BY meeting_date, start_time LIMIT 1', array(today()));
    $out['instagram_handle'] = instagram_handle_clean($out['instagram_handle']);
    $out['next_meeting'] = $next;
    ok($out);
}, array('public' => true));

route('GET', 'public/categories', function () {
    ok(all('SELECT id, name FROM categories WHERE is_archived = 0 ORDER BY sort_order, name'));
}, array('public' => true));

/** Trades represented in BBA right now: category + member count only, no personal data. */
route('GET', 'public/trades', function () {
    $rows = all("SELECT COALESCE(NULLIF(m.category_other, ''), c.name) AS name, COUNT(*) AS n
        FROM members m LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.status = 'approved' AND m.role = 'member' AND (c.name IS NOT NULL OR m.category_other IS NOT NULL)
        GROUP BY COALESCE(NULLIF(m.category_other, ''), c.name) ORDER BY n DESC, name");
    ok($rows);
}, array('public' => true));

route('GET', 'public/next-meeting', function () {
    ok(one('SELECT id, title, meeting_date, start_time, venue, online_link FROM meetings WHERE meeting_date >= ? ORDER BY meeting_date, start_time LIMIT 1', array(today())));
}, array('public' => true));

/**
 * The landing page's Instagram grid. Posts come from a Behold.so JSON feed
 * (free plan: Behold re-reads Instagram once a day; 1,200 feed requests a month).
 * We fetch it server-side at most once an hour (~720 requests a month), so
 * visitors never count against that limit and a new post shows up as soon as
 * Behold has it. The last good copy is served if Behold is unreachable.
 */
route('GET', 'public/instagram', function () {
    $handle = instagram_handle_clean(setting('instagram_handle', ''));
    $feedUrl = (string) setting('instagram_feed_url', '');
    $out = array('username' => $handle, 'posts' => array());
    if ($feedUrl === '') {
        ok($out);
    }
    $cacheFile = PRIVATE_DIR . '/cache/instagram.json';
    $cached = is_file($cacheFile) ? json_decode((string) file_get_contents($cacheFile), true) : null;
    $fresh = is_array($cached) && isset($cached['source']) && $cached['source'] === $feedUrl && filemtime($cacheFile) > time() - 3600;
    if (!$fresh) {
        $feed = instagram_fetch($feedUrl);
        if ($feed !== null) {
            $cached = array('source' => $feedUrl, 'username' => $feed['username'], 'posts' => $feed['posts']);
            if (!is_dir(dirname($cacheFile))) {
                @mkdir(dirname($cacheFile), 0755, true);
            }
            @file_put_contents($cacheFile, json_encode($cached, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } elseif (is_file($cacheFile)) {
            @touch($cacheFile, time() - 1800); // retry in ~30 minutes, serve the stale copy meanwhile
        }
    }
    if (is_array($cached) && isset($cached['source']) && $cached['source'] === $feedUrl) {
        $out['posts'] = instagram_apply_covers($cached['posts']);
        if ($out['username'] === '' && $cached['username']) {
            $out['username'] = $cached['username'];
        }
    }
    ok($out);
}, array('public' => true));

function instagram_handle_clean($h)
{
    $h = trim((string) $h);
    if (preg_match('#instagram\.com/([A-Za-z0-9._]+)#i', $h, $m)) {
        $h = $m[1];
    }
    return ltrim($h, '@ ');
}

/** @return array [status, body]; status 0 when the request could not be made. */
function http_get($url, $headers = array(), $timeout = 12, $maxBytes = 5242880)
{
    $headers = array_merge(array('User-Agent: BBA-Networking/1.0'), $headers);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 4,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => $headers,
        ));
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(array('http' => array('timeout' => $timeout, 'header' => implode("\r\n", $headers), 'ignore_errors' => true)));
        $body = @file_get_contents($url, false, $ctx);
        $status = $body === false ? 0 : 200;
        if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0] . ' ', $m)) {
            $status = (int) $m[1];
        }
    }
    if ($body === false || strlen((string) $body) > $maxBytes) {
        return array(0, '');
    }
    return array($status, (string) $body);
}

/** @return array|null ['username' => string, 'posts' => array] */
function instagram_fetch($url)
{
    list($status, $body) = http_get($url, array('Accept: application/json'));
    if ($status !== 200) {
        $body = null;
    }
    $json = $body ? json_decode($body, true) : null;
    if (!is_array($json) || !isset($json['posts']) || !is_array($json['posts'])) {
        log_line('instagram', 'Feed fetch failed for ' . $url);
        return null;
    }
    $posts = array();
    foreach ($json['posts'] as $p) {
        $img = null;
        foreach (array('medium', 'small', 'large') as $size) {
            if (!$img && isset($p['sizes'][$size]['mediaUrl'])) {
                $img = $p['sizes'][$size]['mediaUrl'];
            }
        }
        if (!$img) {
            $img = isset($p['thumbnailUrl']) ? $p['thumbnailUrl'] : (isset($p['mediaUrl']) ? $p['mediaUrl'] : null);
        }
        if (!$img || empty($p['permalink'])) {
            continue;
        }
        $caption = isset($p['prunedCaption']) ? $p['prunedCaption'] : (isset($p['caption']) ? $p['caption'] : '');
        $posts[] = array(
            'id' => (string) $p['id'],
            'permalink' => $p['permalink'],
            'image' => $img,
            'type' => isset($p['mediaType']) ? $p['mediaType'] : 'IMAGE',
            'alt' => !empty($p['altText']) ? $p['altText'] : mb_substr(trim($caption), 0, 140),
            'caption' => mb_substr(trim($caption), 0, 280),
            'timestamp' => isset($p['timestamp']) ? $p['timestamp'] : null,
        );
        if (count($posts) >= 9) {
            break;
        }
    }
    return array('username' => isset($json['username']) ? (string) $json['username'] : '', 'posts' => $posts);
}

/*
 * Reel covers. Instagram's API (and so Behold) gives a reel's first video frame as
 * its thumbnail, which is black for reels that fade in. The cover the account chose
 * is only in the post's public link preview (og:image). We read it once per reel,
 * keep a copy in uploads/ig (Instagram's image links expire), and fall back to
 * Behold's image if anything fails. At most 2 lookups per request, failures retried
 * after 6 hours, so a slow Instagram never holds up the landing page for long.
 */
function instagram_apply_covers($posts)
{
    $mapFile = PRIVATE_DIR . '/cache/instagram-covers.json';
    $map = is_file($mapFile) ? json_decode((string) file_get_contents($mapFile), true) : array();
    $map = is_array($map) ? $map : array();
    $changed = false;
    $lookups = 0;
    $live = array();
    foreach ($posts as $i => $p) {
        if ($p['type'] !== 'VIDEO') {
            continue;
        }
        $id = preg_replace('/\D/', '', (string) $p['id']);
        if ($id === '') {
            continue;
        }
        $live[$id] = true;
        $e = isset($map[$id]) ? $map[$id] : null;
        if (!empty($e['path']) && is_file(public_root() . '/' . $e['path'])) {
            $posts[$i]['image'] = app_url('/' . $e['path']);
            continue;
        }
        if ($lookups >= 2 || (is_array($e) && isset($e['tried']) && $e['tried'] > time() - 21600)) {
            continue;
        }
        $lookups++;
        $path = instagram_save_cover($p['permalink'], $id);
        $map[$id] = array('path' => $path, 'tried' => time());
        $changed = true;
        if ($path) {
            $posts[$i]['image'] = app_url('/' . $path);
        }
    }
    // Forget reels that dropped out of the feed.
    foreach ($map as $id => $e) {
        if (!isset($live[$id])) {
            if (!empty($e['path']) && preg_match('#^uploads/ig/\d+\.jpg$#', $e['path'])) {
                @unlink(public_root() . '/' . $e['path']);
            }
            unset($map[$id]);
            $changed = true;
        }
    }
    if ($changed) {
        @file_put_contents($mapFile, json_encode($map));
    }
    return $posts;
}

/** @return string|null the saved cover's path relative to the web root */
function instagram_save_cover($permalink, $id)
{
    if (!preg_match('#^https://www\.instagram\.com/(reel|p|tv)/[A-Za-z0-9_-]+/?$#', $permalink)) {
        return null;
    }
    // Instagram serves the full link preview to link-unfurling bots.
    list($status, $html) = http_get($permalink, array('User-Agent: facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept: text/html'), 8, 3145728);
    if ($status !== 200 || !preg_match('#<meta property="og:image" content="([^"]+)"#', $html, $m)) {
        log_line('instagram', 'No cover found for ' . $permalink . ' (HTTP ' . $status . ')');
        return null;
    }
    $img = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
    $host = (string) parse_url($img, PHP_URL_HOST);
    if (!preg_match('#(^|\.)(cdninstagram\.com|fbcdn\.net)$#', $host)) {
        return null;
    }
    list($status, $bytes) = http_get($img, array('Accept: image/*'), 8, 2097152);
    $info = $status === 200 ? @getimagesizefromstring($bytes) : false;
    if (!$info || $info[2] !== IMAGETYPE_JPEG || $info[0] < 100) {
        log_line('instagram', 'Cover download failed for ' . $permalink);
        return null;
    }
    $dir = public_root() . '/uploads/ig';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $guard = public_root() . '/uploads/avatars/.htaccess';
    if (!is_file($dir . '/.htaccess') && is_file($guard)) {
        @copy($guard, $dir . '/.htaccess');
    }
    if (@file_put_contents($dir . '/' . $id . '.jpg', $bytes) === false) {
        return null;
    }
    return 'uploads/ig/' . $id . '.jpg';
}
