<?php
/**
 * Core helpers: config, database, JSON responses, input and validation.
 * PHP 7.3 compatible — no arrow functions, typed properties, match, nullsafe, etc.
 */

class ApiError extends Exception
{
    /** @var string */
    public $errCode;
    /** @var int */
    public $status;
    /** @var array|null */
    public $fields;

    public function __construct($errCode, $message, $status = 400, $fields = null)
    {
        parent::__construct($message);
        $this->errCode = $errCode;
        $this->status = $status;
        $this->fields = $fields;
    }
}

function config($key = null, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $file = PRIVATE_DIR . '/config.secrets.php';
        if (!is_file($file)) {
            throw new ApiError('not_configured', 'The server is not configured yet.', 500);
        }
        $cfg = require $file;
    }
    if ($key === null) {
        return $cfg;
    }
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

/** @return PDO */
function db()
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $driver = config('DB_DRIVER', 'sqlite');
    $opts = array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    );
    if ($driver === 'mysql') {
        $opts[PDO::ATTR_EMULATE_PREPARES] = false;
        $dsn = 'mysql:host=' . config('DB_HOST', 'localhost') . ';dbname=' . config('DB_NAME') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, config('DB_USER'), config('DB_PASS'), $opts);
        $pdo->exec("SET time_zone = '+05:30'");
    } else {
        $dir = PRIVATE_DIR . '/data';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $pdo = new PDO('sqlite:' . $dir . '/bba.sqlite', null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 8000');
    }
    return $pdo;
}

function is_mysql()
{
    return config('DB_DRIVER', 'sqlite') === 'mysql';
}

/** @return PDOStatement */
function q($sql, $params = array())
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function one($sql, $params = array())
{
    $r = q($sql, $params)->fetch();
    return $r ? $r : null;
}

function all($sql, $params = array())
{
    return q($sql, $params)->fetchAll();
}

function val($sql, $params = array())
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function now()
{
    return date('Y-m-d H:i:s');
}

function today()
{
    return date('Y-m-d');
}

/** Tables without created_at / updated_at columns. */
function untimed_tables()
{
    return array('settings', 'member_flags');
}

function insert($table, $data)
{
    if (!in_array($table, untimed_tables(), true)) {
        if (!isset($data['created_at'])) {
            $data['created_at'] = now();
        }
        if (!isset($data['updated_at'])) {
            $data['updated_at'] = $data['created_at'];
        }
    }
    $cols = array_keys($data);
    $sql = 'INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES (' .
        implode(', ', array_fill(0, count($cols), '?')) . ')';
    q($sql, array_values($data));
    return (int) db()->lastInsertId();
}

function update_row($table, $id, $data)
{
    if (!$data) {
        return;
    }
    if (!in_array($table, untimed_tables(), true)) {
        $data['updated_at'] = now();
    }
    $sets = array();
    foreach (array_keys($data) as $c) {
        $sets[] = $c . ' = ?';
    }
    $params = array_values($data);
    $params[] = $id;
    q('UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
}

function in_placeholders($arr)
{
    return implode(',', array_fill(0, max(1, count($arr)), '?'));
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function setting($name, $default = null)
{
    $all = settings_all();
    return array_key_exists($name, $all) ? $all[$name] : $default;
}

function settings_all($reload = false)
{
    static $cache = null;
    if ($cache === null || $reload) {
        $cache = array();
        foreach (all('SELECT name, value FROM settings') as $r) {
            $cache[$r['name']] = $r['value'];
        }
    }
    return $cache;
}

function setting_set($name, $value)
{
    if (one('SELECT name FROM settings WHERE name = ?', array($name))) {
        q('UPDATE settings SET value = ? WHERE name = ?', array((string) $value, $name));
    } else {
        q('INSERT INTO settings (name, value) VALUES (?, ?)', array($name, (string) $value));
    }
    settings_all(true);
}

/* ------------------------------------------------------------------ */
/* Request / response                                                  */
/* ------------------------------------------------------------------ */

function request_id()
{
    static $id = null;
    if ($id === null) {
        $id = bin2hex(random_bytes(6));
    }
    return $id;
}

function client_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? substr($_SERVER['REMOTE_ADDR'], 0, 45) : '';
}

function input()
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'multipart/form-data') !== false) {
        $data = $_POST;
        if (isset($_POST['data'])) {
            $decoded = json_decode($_POST['data'], true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }
    } else {
        $raw = file_get_contents('php://input');
        $decoded = $raw ? json_decode($raw, true) : array();
        $data = is_array($decoded) ? $decoded : array();
    }
    return $data;
}

function in_val($key, $default = null)
{
    $d = input();
    return array_key_exists($key, $d) ? $d[$key] : $default;
}

function qs($key, $default = null)
{
    return isset($_GET[$key]) && $_GET[$key] !== '' ? $_GET[$key] : $default;
}

function qs_int($key, $default = 0)
{
    return isset($_GET[$key]) && is_numeric($_GET[$key]) ? (int) $_GET[$key] : $default;
}

function send_json($payload, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok($data = null)
{
    send_json(array('ok' => true, 'data' => cast_deep($data)));
}

function fail($code, $message, $status = 400, $fields = null)
{
    throw new ApiError($code, $message, $status, $fields);
}

/**
 * SQLite (and PHP 7.3 PDO in general) returns numbers as strings. Cast keys that
 * are known to be numeric so the frontend always receives numbers.
 */
function cast_deep($data)
{
    if (!is_array($data)) {
        return $data;
    }
    $out = array();
    foreach ($data as $k => $v) {
        if (is_array($v)) {
            $out[$k] = cast_deep($v);
        } elseif (is_string($v) && is_string($k) && is_numeric($v) && numeric_key($k)) {
            $out[$k] = (strpos($v, '.') !== false) ? (float) $v : (int) $v;
        } else {
            $out[$k] = $v;
        }
    }
    return $out;
}

function numeric_key($k)
{
    return (bool) preg_match(
        '/^(id|n|value|total|count|done|target|pct|sort_order|attempts|session_version|unread|page|per_page)$|_id$|^is_|_count$|_value$|_total$|_by$|^cnt|_pct$|^sum_|^num_|^business_|^referrals_|^ones_|^visitors_|^members_|^present|^absent|^excused|^prev_/',
        $k
    ) && !preg_match('/_text$|_name$|_at$|_date$/', $k);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

class V
{
    /** @var array */
    public $in;
    /** @var array */
    public $errors = array();

    public function __construct($in = null)
    {
        $this->in = $in === null ? input() : $in;
    }

    public function raw($k)
    {
        return array_key_exists($k, $this->in) ? $this->in[$k] : null;
    }

    public function str($k, $label, $required = true, $max = 190, $min = 0)
    {
        $v = $this->raw($k);
        $v = is_scalar($v) ? trim((string) $v) : '';
        if ($v === '') {
            if ($required) {
                $this->errors[$k] = $label . ' is required.';
            }
            return null;
        }
        if (mb_strlen($v) > $max) {
            $this->errors[$k] = $label . ' must be ' . $max . ' characters or fewer.';
        } elseif ($min && mb_strlen($v) < $min) {
            $this->errors[$k] = $label . ' must be at least ' . $min . ' characters.';
        }
        return $v;
    }

    public function email($k, $label = 'Email', $required = true)
    {
        $v = $this->str($k, $label, $required, 190);
        if ($v !== null) {
            $v = strtolower($v);
            if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                $this->errors[$k] = 'Enter a valid email address.';
            }
        }
        return $v;
    }

    public function mobile($k, $label = 'Mobile number', $required = true)
    {
        $v = $this->str($k, $label, $required, 20);
        if ($v !== null) {
            $v = normalize_mobile($v);
            if (!preg_match('/^[6-9]\d{9}$/', $v)) {
                $this->errors[$k] = 'Enter a valid 10-digit mobile number.';
            }
        }
        return $v;
    }

    public function int($k, $label, $required = true, $min = null, $max = null)
    {
        $v = $this->raw($k);
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$k] = $label . ' is required.';
            }
            return null;
        }
        if (!is_numeric($v) || (int) $v != $v) {
            $this->errors[$k] = $label . ' must be a whole number.';
            return null;
        }
        $v = (int) $v;
        if (($min !== null && $v < $min) || ($max !== null && $v > $max)) {
            $this->errors[$k] = $label . ' is out of range.';
        }
        return $v;
    }

    public function money($k, $label, $required = true)
    {
        $v = $this->raw($k);
        if (is_string($v)) {
            $v = str_replace(array(',', '₹', ' '), '', $v);
        }
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$k] = $label . ' is required.';
            }
            return null;
        }
        if (!is_numeric($v) || $v < 0 || $v > 999999999999) {
            $this->errors[$k] = 'Enter a valid amount.';
            return null;
        }
        return round((float) $v, 2);
    }

    public function date($k, $label, $required = true)
    {
        $v = $this->str($k, $label, $required, 10);
        if ($v !== null) {
            $d = DateTime::createFromFormat('Y-m-d', $v);
            if (!$d || $d->format('Y-m-d') !== $v) {
                $this->errors[$k] = 'Enter a valid date.';
                return null;
            }
        }
        return $v;
    }

    public function datetime($k, $label, $required = true)
    {
        $v = $this->str($k, $label, $required, 25);
        if ($v !== null) {
            $ts = strtotime(str_replace('T', ' ', $v));
            if ($ts === false) {
                $this->errors[$k] = 'Enter a valid date and time.';
                return null;
            }
            return date('Y-m-d H:i:s', $ts);
        }
        return $v;
    }

    public function enum($k, $label, $allowed, $required = true, $default = null)
    {
        $v = $this->raw($k);
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$k] = $label . ' is required.';
            }
            return $default;
        }
        if (!in_array($v, $allowed, true)) {
            $this->errors[$k] = $label . ' is not valid.';
            return $default;
        }
        return $v;
    }

    public function url($k, $label, $required = false)
    {
        $v = $this->str($k, $label, $required, 255);
        if ($v !== null) {
            if (!preg_match('#^https?://#i', $v)) {
                $v = 'https://' . $v;
            }
            if (!filter_var($v, FILTER_VALIDATE_URL)) {
                $this->errors[$k] = 'Enter a valid link.';
            }
        }
        return $v;
    }

    public function tags($k, $label, $required = false, $maxTags = 20)
    {
        $v = $this->raw($k);
        if (is_string($v)) {
            $v = explode(',', $v);
        }
        $out = array();
        if (is_array($v)) {
            foreach ($v as $t) {
                $t = trim(str_replace(',', ' ', (string) $t));
                if ($t !== '' && mb_strlen($t) <= 60 && !in_array(mb_strtolower($t), array_map('mb_strtolower', $out), true)) {
                    $out[] = $t;
                }
            }
        }
        $out = array_slice($out, 0, $maxTags);
        if ($required && !$out) {
            $this->errors[$k] = 'Add at least one item to ' . $label . '.';
        }
        return implode(', ', $out);
    }

    public function bool($k)
    {
        $v = $this->raw($k);
        return ($v === true || $v === 1 || $v === '1' || $v === 'true') ? 1 : 0;
    }

    public function error($k, $msg)
    {
        $this->errors[$k] = $msg;
    }

    public function done()
    {
        if ($this->errors) {
            $first = reset($this->errors);
            throw new ApiError('validation', $first, 422, $this->errors);
        }
    }
}

function normalize_mobile($v)
{
    $d = preg_replace('/\D+/', '', (string) $v);
    if (strlen($d) === 12 && substr($d, 0, 2) === '91') {
        $d = substr($d, 2);
    }
    if (strlen($d) === 11 && $d[0] === '0') {
        $d = substr($d, 1);
    }
    return $d;
}

function rand_hex($bytes = 16)
{
    return bin2hex(random_bytes($bytes));
}

function money_fmt($n)
{
    $n = (float) $n;
    $neg = $n < 0;
    $n = (string) round(abs($n));
    $last3 = substr($n, -3);
    $rest = substr($n, 0, -3);
    if ($rest !== '' && $rest !== false) {
        $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
        $n = $rest . ',' . $last3;
    }
    return ($neg ? '-' : '') . '₹' . $n;
}

function date_fmt($d)
{
    return $d ? date('j M Y', strtotime($d)) : '';
}

function app_url($path = '')
{
    return rtrim(config('APP_URL', ''), '/') . $path;
}
