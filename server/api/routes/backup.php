<?php
/**
 * Full backup and restore (Admin → Backup).
 *
 * Export: one ZIP holding every database table (database/<table>.json) and every
 * uploaded file (files/<folder>/<name>), described by manifest.json.
 * Import: that same ZIP, uploaded in chunks (shared hosting caps one upload at a
 * few MB), checked completely before anything changes, then restored in a single
 * database transaction. The current data is saved as a "safety copy" first, so a
 * restore can itself be undone.
 */

define('BACKUP_FORMAT', 'bba-backup');
define('BACKUP_FORMAT_VERSION', 1);
define('BACKUP_MAX_UPLOAD', 524288000);   // 500 MB zipped
define('BACKUP_MAX_ENTRY', 104857600);    // 100 MB for any one table or file
define('BACKUP_CHUNK_MAX', 8388608);      // matches upload_max_filesize in .user.ini
define('BACKUP_SAFETY_KEEP', 5);

function backup_dir()
{
    $dir = PRIVATE_DIR . '/backups';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/** Folder key in the ZIP => folder on the server. Instagram covers (uploads/ig) rebuild themselves. */
function backup_file_dirs()
{
    return array(
        'uploads/avatars' => public_root() . '/uploads/avatars',
        'uploads/site' => public_root() . '/uploads/site',
        'private/121' => PRIVATE_DIR . '/uploads/121',
        'private/proofs' => PRIVATE_DIR . '/uploads/proofs',
        'private/tmp' => PRIVATE_DIR . '/uploads/tmp',
        'private/visit' => PRIVATE_DIR . '/uploads/visit',
    );
}

/** Uploaded files are random hex names; anything else (.htaccess, .DS_Store) is not data. */
function backup_file_name_ok($name)
{
    return (bool) preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.(jpg|jpeg|png|webp|gif|pdf)$/i', $name);
}

function backup_list_files($dir)
{
    $out = array();
    if (!is_dir($dir)) {
        return $out;
    }
    foreach (scandir($dir) as $f) {
        if (backup_file_name_ok($f) && is_file($dir . '/' . $f)) {
            $out[] = $f;
        }
    }
    sort($out);
    return $out;
}

function backup_tables()
{
    $out = array();
    if (is_mysql()) {
        foreach (q('SHOW TABLES')->fetchAll(PDO::FETCH_NUM) as $r) {
            $out[] = $r[0];
        }
    } else {
        foreach (all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as $r) {
            $out[] = $r['name'];
        }
    }
    sort($out);
    return array_values(array_filter($out, 'backup_ident_ok'));
}

function backup_table_columns($table)
{
    $out = array();
    if (is_mysql()) {
        foreach (all('SHOW COLUMNS FROM ' . $table) as $r) {
            $out[] = $r['Field'];
        }
    } else {
        foreach (all('PRAGMA table_info(' . $table . ')') as $r) {
            $out[] = $r['name'];
        }
    }
    return $out;
}

function backup_ident_ok($s)
{
    return is_string($s) && (bool) preg_match('/^[a-z_][a-z0-9_]{0,63}$/', $s);
}

function backup_json($data)
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    $json = json_encode($data, $flags);
    if ($json === false) {
        // A stray byte that is not UTF-8 would otherwise stop the whole backup.
        $json = json_encode($data, $flags | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    if ($json === false) {
        throw new ApiError('backup_failed', 'The backup could not be written: ' . json_last_error_msg(), 500);
    }
    return $json;
}

/** Write a complete backup to $path. @return array the manifest */
function backup_build($path)
{
    $zip = new ZipOut($path);
    $tables = array();
    foreach (backup_tables() as $t) {
        $cols = array_values(array_filter(backup_table_columns($t), 'backup_ident_ok'));
        $order = in_array('id', $cols, true) ? 'id' : $cols[0];
        $st = q('SELECT ' . implode(', ', $cols) . ' FROM ' . $t . ' ORDER BY ' . $order);
        $rows = $st->fetchAll(PDO::FETCH_NUM);
        $zip->add('database/' . $t . '.json', backup_json(array('table' => $t, 'columns' => $cols, 'rows' => $rows)));
        $tables[$t] = count($rows);
        unset($rows);
    }
    $count = 0;
    $bytes = 0;
    $perDir = array();
    foreach (backup_file_dirs() as $key => $dir) {
        $perDir[$key] = 0;
        foreach (backup_list_files($dir) as $name) {
            $data = @file_get_contents($dir . '/' . $name);
            if ($data === false) {
                throw new ApiError('backup_failed', 'Could not read ' . $key . '/' . $name . ' for the backup.', 500);
            }
            $zip->add('files/' . $key . '/' . $name, $data, false);
            $count++;
            $perDir[$key]++;
            $bytes += strlen($data);
        }
    }
    $manifest = array(
        'format' => BACKUP_FORMAT,
        'format_version' => BACKUP_FORMAT_VERSION,
        'app' => 'BBA Networking',
        'site' => app_url(),
        'created_at' => now(),
        'timezone' => date_default_timezone_get(),
        'schema_version' => schema_version(),
        'migrations' => applied_migrations(),
        'db_driver' => is_mysql() ? 'mysql' : 'sqlite',
        'tables' => $tables,
        'files' => $perDir,
        'file_count' => $count,
        'file_bytes' => $bytes,
    );
    $zip->add('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $zip->add('README.txt', implode("\r\n", array(
        'BBA Networking - full backup',
        'Made ' . $manifest['created_at'] . ' (' . $manifest['timezone'] . ') from ' . $manifest['site'],
        '',
        'This file holds everything stored by the BBA dashboard and website: members, referrals,',
        '121s, meetings, attendance, visitors, visitor-form responses, notifications, settings,',
        'landing-page text, the audit log, and every uploaded photo, proof and QR code.',
        '',
        'To restore it: log in to the dashboard as an admin, open Admin > Backup, choose',
        '"Restore from a backup" and pick this ZIP file. Do not unzip and edit it first.',
        '',
        'Not included: the server configuration (database driver, email API key), which lives',
        'in api/_private/config.secrets.php on the server.',
        '',
        'Contains personal data. Keep it somewhere private.',
    )), true);
    $zip->close();
    return $manifest;
}

/**
 * Open and fully check a backup ZIP without changing anything: manifest, every
 * table (structure and row count) and every file (checksum). Throws ApiError
 * with a message for the admin.
 * @return array [zip, prefix, manifest, tables => [name => entry], files => [[key, name, entry]], summary]
 */
function backup_open($path)
{
    try {
        $zip = new ZipIn($path);
    } catch (Exception $e) {
        throw new ApiError('bad_backup', $e->getMessage(), 422);
    }
    try {
        return backup_check($zip);
    } catch (Exception $e) {
        $zip->close();
        if ($e instanceof ApiError) {
            throw $e;
        }
        throw new ApiError('bad_backup', $e->getMessage(), 422);
    }
}

function backup_check($zip)
{
    $bad = function ($msg) {
        throw new ApiError('bad_backup', $msg, 422);
    };
    // The manifest marks the backup's root, so a ZIP that was unzipped and re-zipped
    // inside a folder still works.
    $manifestName = null;
    foreach (array_keys($zip->entries) as $name) {
        if (strpos($name, '__MACOSX/') === 0) {
            continue;
        }
        if (($name === 'manifest.json' || substr($name, -14) === '/manifest.json') && ($manifestName === null || strlen($name) < strlen($manifestName))) {
            $manifestName = $name;
        }
    }
    if ($manifestName === null) {
        $bad('This ZIP is not a BBA backup (it has no manifest.json). Choose a file downloaded from Admin → Backup.');
    }
    $prefix = substr($manifestName, 0, -strlen('manifest.json'));
    $m = json_decode($zip->read($manifestName, 1048576), true);
    if (!is_array($m) || !isset($m['format']) || $m['format'] !== BACKUP_FORMAT) {
        $bad('This ZIP is not a BBA backup. Choose a file downloaded from Admin → Backup.');
    }
    if (!isset($m['format_version'], $m['schema_version'], $m['tables']) || !is_int($m['format_version']) || !is_int($m['schema_version']) || !is_array($m['tables'])) {
        $bad('The backup\'s manifest is damaged.');
    }
    if ($m['format_version'] > BACKUP_FORMAT_VERSION || $m['schema_version'] > schema_version()) {
        $bad('This backup was made by a newer version of the BBA app. Update the app on this server, then restore it.');
    }
    $migrations = isset($m['migrations']) && is_array($m['migrations']) ? $m['migrations'] : array();

    $tables = array();
    $files = array();
    $seenFiles = array();
    $skipped = 0;
    $total = 0;
    $dirs = backup_file_dirs();
    foreach ($zip->entries as $name => $e) {
        if ($prefix !== '' && strpos($name, $prefix) !== 0) {
            continue;
        }
        $rel = substr($name, strlen($prefix));
        $total += $e['usize'];
        if (preg_match('#^database/([^/]+)\.json$#', $rel, $mm)) {
            if (!backup_ident_ok($mm[1])) {
                $bad('The backup contains an unexpected table: ' . mb_substr($mm[1], 0, 60));
            }
            $tables[$mm[1]] = $name;
        } elseif (preg_match('#^files/(.+)/([^/]+)$#', $rel, $mm)) {
            if (isset($dirs[$mm[1]]) && backup_file_name_ok($mm[2]) && !isset($seenFiles[$mm[1] . '/' . $mm[2]])) {
                $files[] = array($mm[1], $mm[2], $name);
                $seenFiles[$mm[1] . '/' . $mm[2]] = true;
            } else {
                $skipped++; // e.g. .DS_Store added by a Mac
            }
        }
    }
    if ($total > 2 * BACKUP_MAX_UPLOAD) {
        $bad('This backup is too large to restore here.');
    }
    foreach (array('members', 'settings') as $must) {
        if (!isset($tables[$must])) {
            $bad('The backup is incomplete: the ' . $must . ' table is missing.');
        }
    }
    foreach ($m['tables'] as $t => $n) {
        if (!isset($tables[$t])) {
            $bad('The backup is incomplete: the ' . $t . ' table is missing.');
        }
    }

    // Read every table: right shape, and as many rows as the manifest says.
    $rowsTotal = 0;
    $counts = array();
    foreach ($tables as $t => $entry) {
        $data = json_decode($zip->read($entry, BACKUP_MAX_ENTRY), true);
        if (!is_array($data) || !isset($data['columns'], $data['rows']) || !is_array($data['columns']) || !is_array($data['rows'])) {
            $bad('The backup is damaged: table ' . $t . ' could not be read.');
        }
        $cols = $data['columns'];
        if (!$cols || count(array_filter($cols, 'backup_ident_ok')) !== count($cols) || count(array_unique($cols)) !== count($cols)) {
            $bad('The backup is damaged: table ' . $t . ' has invalid columns.');
        }
        foreach ($data['rows'] as $row) {
            if (!is_array($row) || count($row) !== count($cols)) {
                $bad('The backup is damaged: table ' . $t . ' has a malformed row.');
            }
            foreach ($row as $cell) {
                if ($cell !== null && !is_scalar($cell)) {
                    $bad('The backup is damaged: table ' . $t . ' has a malformed value.');
                }
            }
        }
        if (isset($m['tables'][$t]) && (int) $m['tables'][$t] !== count($data['rows'])) {
            $bad('The backup is incomplete: table ' . $t . ' should have ' . (int) $m['tables'][$t] . ' rows but has ' . count($data['rows']) . '.');
        }
        $counts[$t] = count($data['rows']);
        $rowsTotal += $counts[$t];
        unset($data);
    }

    // Every file must be intact (checksums are verified as it is read).
    $bytes = 0;
    foreach ($files as $f) {
        $bytes += strlen($zip->read($f[2], BACKUP_MAX_ENTRY));
    }
    if (isset($m['file_count']) && (int) $m['file_count'] !== count($files)) {
        $bad('The backup is incomplete: it should hold ' . (int) $m['file_count'] . ' files but has ' . count($files) . '.');
    }

    $members = 0;
    $admins = 0;
    $data = json_decode($zip->read($tables['members'], BACKUP_MAX_ENTRY), true);
    $roleIdx = array_search('role', $data['columns'], true);
    $statusIdx = array_search('status', $data['columns'], true);
    foreach ($data['rows'] as $r) {
        if ($roleIdx !== false && $r[$roleIdx] === 'admin') {
            $admins++;
        } elseif ($statusIdx !== false && $r[$statusIdx] === 'approved') {
            $members++;
        }
    }
    unset($data);

    $current = backup_tables();
    $unknown = array_values(array_diff(array_keys($tables), $current));
    return array(
        'zip' => $zip,
        'prefix' => $prefix,
        'manifest' => $m,
        'migrations' => $migrations,
        'tables' => $tables,
        'files' => $files,
        'summary' => array(
            'created_at' => isset($m['created_at']) ? (string) $m['created_at'] : '',
            'site' => isset($m['site']) ? (string) $m['site'] : '',
            'schema_version' => $m['schema_version'],
            'tables' => $counts,
            'rows_total' => $rowsTotal,
            'members' => $members,
            'admins' => $admins,
            'file_count' => count($files),
            'file_bytes' => $bytes,
            'skipped_entries' => $skipped,
            'unknown_tables' => $unknown,
        ),
    );
}

/** Replace all data with the backup's. Files are staged first; the database changes in one transaction. */
function backup_apply($b)
{
    $zip = $b['zip'];
    $stage = backup_dir() . '/restore-' . rand_hex(8);
    $dirs = backup_file_dirs();
    try {
        foreach ($b['files'] as $f) {
            $d = $stage . '/' . str_replace('/', '__', $f[0]);
            if (!is_dir($d) && !@mkdir($d, 0755, true)) {
                throw new ApiError('restore_failed', 'Could not prepare the files for restore (disk not writable).', 500);
            }
            if (@file_put_contents($d . '/' . $f[1], $zip->read($f[2], BACKUP_MAX_ENTRY)) === false) {
                throw new ApiError('restore_failed', 'Could not prepare the files for restore (disk full?).', 500);
            }
        }

        $pdo = db();
        $current = backup_tables();
        if (is_mysql()) {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        } else {
            $pdo->exec('PRAGMA foreign_keys = OFF'); // has no effect inside a transaction, so it goes first
        }
        $pdo->beginTransaction();
        try {
            foreach ($current as $t) {
                $pdo->exec('DELETE FROM ' . $t);
            }
            foreach ($b['tables'] as $t => $entry) {
                if (!in_array($t, $current, true)) {
                    continue; // a table this version no longer has
                }
                $data = json_decode($zip->read($entry, BACKUP_MAX_ENTRY), true);
                $have = backup_table_columns($t);
                $idx = array();
                foreach ($data['columns'] as $i => $c) {
                    if (in_array($c, $have, true)) {
                        $idx[$c] = $i;
                    }
                }
                if (!$idx || !$data['rows']) {
                    continue;
                }
                $st = $pdo->prepare('INSERT INTO ' . $t . ' (' . implode(', ', array_keys($idx)) . ') VALUES (' . implode(', ', array_fill(0, count($idx), '?')) . ')');
                foreach ($data['rows'] as $row) {
                    $vals = array();
                    foreach ($idx as $i) {
                        $vals[] = is_bool($row[$i]) ? (int) $row[$i] : $row[$i];
                    }
                    $st->execute($vals);
                }
                unset($data);
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    } catch (Exception $e) {
        backup_rmdir($stage);
        if (is_mysql()) {
            db()->exec('SET FOREIGN_KEY_CHECKS = 1');
        } else {
            db()->exec('PRAGMA foreign_keys = ON');
        }
        if ($e instanceof ApiError) {
            throw $e;
        }
        error_log('[' . request_id() . '] restore failed: ' . $e->getMessage());
        throw new ApiError('restore_failed', 'The restore failed and nothing was changed: ' . $e->getMessage(), 500);
    }
    if (is_mysql()) {
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
    } else {
        db()->exec('PRAGMA foreign_keys = ON');
    }

    // An older backup: bring its data up to this version's schema.
    settings_all(true);
    foreach (glob(PRIVATE_DIR . '/data/.schema-v*') as $flag) {
        @unlink($flag);
    }
    run_migrations();
    @file_put_contents(PRIVATE_DIR . '/data/.schema-v' . schema_version(), now());
    settings_all(true);

    // Files: each folder ends up holding exactly the backup's files.
    $problems = 0;
    foreach ($dirs as $key => $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        if (strpos($key, 'uploads/') === 0) {
            upload_guard($dir);
        }
        foreach (backup_list_files($dir) as $old) {
            @unlink($dir . '/' . $old);
        }
        $from = $stage . '/' . str_replace('/', '__', $key);
        if (!is_dir($from)) {
            continue;
        }
        foreach (scandir($from) as $f) {
            if (!backup_file_name_ok($f)) {
                continue;
            }
            if (!@rename($from . '/' . $f, $dir . '/' . $f) && !(@copy($from . '/' . $f, $dir . '/' . $f) && @unlink($from . '/' . $f))) {
                $problems++;
            }
        }
    }
    backup_rmdir($stage);
    foreach (array('public-stats.json', 'instagram.json') as $c) {
        @unlink(PRIVATE_DIR . '/cache/' . $c);
    }
    return $problems;
}

function backup_rmdir($dir)
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        is_dir($dir . '/' . $f) ? backup_rmdir($dir . '/' . $f) : @unlink($dir . '/' . $f);
    }
    @rmdir($dir);
}

/** Where an uploaded backup, or a safety copy, sits on disk. */
function backup_source_path()
{
    $id = (string) in_val('id', '');
    $safety = (string) in_val('safety', '');
    if ($id !== '') {
        if (!preg_match('/^[a-f0-9]{32}$/', $id) || !is_file(backup_dir() . '/upload-' . $id . '.zip')) {
            fail('not_found', 'That upload has expired. Choose the file again.', 404);
        }
        return backup_dir() . '/upload-' . $id . '.zip';
    }
    if ($safety !== '') {
        if (!preg_match('/^before-restore-\d{8}-\d{6}-[a-f0-9]{4}\.zip$/', $safety) || !is_file(backup_dir() . '/' . $safety)) {
            fail('not_found', 'That safety copy no longer exists.', 404);
        }
        return backup_dir() . '/' . $safety;
    }
    fail('validation', 'Choose a backup file.', 422);
}

function backup_safety_list()
{
    $out = array();
    foreach (glob(backup_dir() . '/before-restore-*.zip') as $f) {
        if (preg_match('/before-restore-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-f0-9]{4}\.zip$/', $f, $m)) {
            $out[] = array('name' => basename($f), 'size' => filesize($f), 'made_at' => "$m[1]-$m[2]-$m[3] $m[4]:$m[5]:$m[6]");
        }
    }
    usort($out, function ($a, $b) {
        return strcmp($b['name'], $a['name']);
    });
    return $out;
}

/** Remove abandoned uploads (older than a day) and the oldest safety copies. */
function backup_housekeeping()
{
    foreach (glob(backup_dir() . '/upload-*.zip') as $f) {
        if (filemtime($f) < time() - 86400) {
            @unlink($f);
        }
    }
    foreach (glob(backup_dir() . '/export-*.zip') as $f) {
        if (filemtime($f) < time() - 3600) {
            @unlink($f);
        }
    }
    foreach (array_slice(backup_safety_list(), BACKUP_SAFETY_KEEP) as $s) {
        @unlink(backup_dir() . '/' . $s['name']);
    }
}

function backup_send_file($path, $downloadName, $deleteAfter)
{
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }
    while (ob_get_level()) {
        ob_end_clean();
    }
    header('Content-Type: application/zip');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $downloadName . '"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    if ($deleteAfter) {
        @unlink($path);
    }
    exit;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

route('GET', 'admin/backup/status', function () {
    require_admin();
    backup_housekeeping();
    $rows = 0;
    foreach (backup_tables() as $t) {
        $rows += (int) val('SELECT COUNT(*) FROM ' . $t);
    }
    $files = 0;
    $bytes = 0;
    foreach (backup_file_dirs() as $dir) {
        foreach (backup_list_files($dir) as $f) {
            $files++;
            $bytes += filesize($dir . '/' . $f);
        }
    }
    $last = one("SELECT l.created_at, m.full_name AS by_name FROM audit_logs l LEFT JOIN members m ON m.id = l.actor_id WHERE l.action = 'backup_exported' ORDER BY l.id DESC LIMIT 1");
    $restored = one("SELECT l.created_at, m.full_name AS by_name FROM audit_logs l LEFT JOIN members m ON m.id = l.actor_id WHERE l.action = 'backup_restored' ORDER BY l.id DESC LIMIT 1");
    ok(array(
        'members' => (int) val("SELECT COUNT(*) FROM members WHERE role = 'member' AND status = 'approved'"),
        'rows_total' => $rows,
        'file_count' => $files,
        'file_bytes' => $bytes,
        'last_export' => $last,
        'last_restore' => $restored,
        'safety' => backup_safety_list(),
        'chunk_size' => 2097152,
        'max_upload' => BACKUP_MAX_UPLOAD,
    ));
});

route('GET', 'admin/backup/export', function () {
    require_admin();
    @set_time_limit(900);
    backup_housekeeping();
    $tmp = backup_dir() . '/export-' . rand_hex(8) . '.zip';
    try {
        $m = backup_build($tmp);
    } catch (Exception $e) {
        @unlink($tmp);
        throw $e;
    }
    audit('backup_exported', 'backup', null, null, array('rows' => array_sum($m['tables']), 'files' => $m['file_count']));
    backup_send_file($tmp, 'bba-backup-' . date('Y-m-d-Hi') . '.zip', true);
});

route('GET', 'admin/backup/safety/download', function () {
    require_admin();
    $name = (string) qs('name', '');
    if (!preg_match('/^before-restore-\d{8}-\d{6}-[a-f0-9]{4}\.zip$/', $name) || !is_file(backup_dir() . '/' . $name)) {
        fail('not_found', 'That safety copy no longer exists.', 404);
    }
    backup_send_file(backup_dir() . '/' . $name, 'bba-' . $name, false);
});

/** Append one chunk of a backup ZIP. Send offset 0 without an id to start a new upload. */
route('POST', 'admin/backup/upload', function () {
    require_admin();
    $id = isset($_POST['id']) ? (string) $_POST['id'] : '';
    $offset = isset($_POST['offset']) && is_numeric($_POST['offset']) ? (int) $_POST['offset'] : -1;
    if ($id === '') {
        if ($offset !== 0) {
            fail('validation', 'Start the upload from the beginning.', 422);
        }
        backup_housekeeping();
        $id = rand_hex(16);
    } elseif (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        fail('validation', 'Invalid upload.', 422);
    }
    $f = isset($_FILES['chunk']) && is_array($_FILES['chunk']) ? $_FILES['chunk'] : null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
        fail('upload', 'Part of the file did not arrive. Try again.', 422);
    }
    if ($f['size'] < 1 || $f['size'] > BACKUP_CHUNK_MAX) {
        fail('upload', 'Invalid upload chunk.', 422);
    }
    $path = backup_dir() . '/upload-' . $id . '.zip';
    clearstatcache();
    $have = is_file($path) ? filesize($path) : 0;
    if ($offset < $have && $offset + $f['size'] === $have) {
        ok(array('id' => $id, 'size' => $have)); // a retried chunk that already arrived
    }
    if ($offset !== $have) {
        fail('upload_out_of_step', 'The upload got out of step. Choose the file again.', 409);
    }
    if ($have + $f['size'] > BACKUP_MAX_UPLOAD) {
        @unlink($path);
        fail('too_large', 'This file is larger than any BBA backup should be (500 MB).', 413);
    }
    $bytes = file_get_contents($f['tmp_name']);
    if ($bytes === false || file_put_contents($path, $bytes, FILE_APPEND | LOCK_EX) !== strlen($bytes)) {
        fail('upload', 'The server could not save the upload (disk full?).', 500);
    }
    ok(array('id' => $id, 'size' => $have + strlen($bytes)));
});

/** Check an uploaded backup (or a safety copy) and describe what it holds. Changes nothing. */
route('POST', 'admin/backup/inspect', function () {
    require_admin();
    @set_time_limit(600);
    $path = backup_source_path();
    $b = backup_open($path);
    $b['zip']->close();
    $s = $b['summary'];
    $s['size'] = filesize($path);
    ok($s);
});

route('POST', 'admin/backup/discard', function () {
    require_admin();
    $id = (string) in_val('id', '');
    if (preg_match('/^[a-f0-9]{32}$/', $id)) {
        @unlink(backup_dir() . '/upload-' . $id . '.zip');
    }
    ok(true);
});

route('POST', 'admin/backup/restore', function () {
    $me = require_admin();
    if (in_val('confirm') !== 'RESTORE') {
        fail('validation', 'Type RESTORE to confirm.', 422, array('confirm' => 'Type RESTORE to confirm.'));
    }
    @set_time_limit(900);
    ignore_user_abort(true); // a closed tab must not stop a restore halfway
    $path = backup_source_path();
    $lock = fopen(backup_dir() . '/.restore.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        fail('busy', 'A restore is already running. Wait a minute and refresh.', 409);
    }
    $b = backup_open($path);

    // Save what is here now, so this restore can be undone.
    // Unique even for two restores in one second (the source may itself be a safety copy).
    $safetyName = 'before-restore-' . date('Ymd-His') . '-' . rand_hex(2) . '.zip';
    try {
        backup_build(backup_dir() . '/' . $safetyName);
    } catch (Exception $e) {
        @unlink(backup_dir() . '/' . $safetyName);
        $b['zip']->close();
        throw new ApiError('restore_failed', 'Could not save a safety copy of the current data first, so nothing was changed. (' . $e->getMessage() . ')', 500);
    }

    $problems = backup_apply($b);
    $b['zip']->close();
    if (strpos($path, '/upload-') !== false) {
        @unlink($path);
    }
    backup_housekeeping();
    $s = $b['summary'];
    audit('backup_restored', 'backup', null, null, array(
        'backup_made_at' => $s['created_at'],
        'rows' => $s['rows_total'],
        'files' => $s['file_count'],
        'safety_copy' => $safetyName,
    ), (int) $me['id']);
    flock($lock, LOCK_UN);
    fclose($lock);

    // Still signed in only if this admin exists, unchanged, in the restored data.
    $still = one('SELECT id FROM members WHERE id = ? AND role = ? AND status = ? AND session_version = ?', array($me['id'], 'admin', 'approved', $me['session_version']));
    ok(array('summary' => $s, 'safety' => $safetyName, 'signed_in' => (bool) $still, 'file_problems' => $problems));
});
