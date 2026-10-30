<?php
/**
 * One-time codes for joining and password reset.
 * 6 digits, hashed, 10-minute expiry, 5 attempts, 60s resend cooldown,
 * max 5 per email/hour and 20 per IP/hour. A new code kills older ones.
 */

function otp_issue($email, $purpose, $silent = false)
{
    $hourAgo = date('Y-m-d H:i:s', time() - 3600);
    $last = one('SELECT created_at FROM otp_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1', array($email, $purpose));
    if ($last && strtotime($last['created_at']) > time() - 60) {
        if ($silent) {
            return null;
        }
        $wait = 60 - (time() - strtotime($last['created_at']));
        fail('cooldown', 'Please wait ' . $wait . ' seconds before requesting another code.', 429);
    }
    $perEmail = (int) val('SELECT COUNT(*) FROM otp_codes WHERE email = ? AND created_at > ?', array($email, $hourAgo));
    $perIp = (int) val('SELECT COUNT(*) FROM otp_codes WHERE ip = ? AND created_at > ?', array(client_ip(), $hourAgo));
    if ($perEmail >= 5 || $perIp >= 20) {
        if ($silent) {
            return null;
        }
        fail('rate_limited', 'Too many codes requested. Please try again in an hour.', 429);
    }
    q('UPDATE otp_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL', array(now(), $email, $purpose));
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    insert('otp_codes', array(
        'email' => $email,
        'purpose' => $purpose,
        'code_hash' => password_hash($code, PASSWORD_DEFAULT),
        'expires_at' => date('Y-m-d H:i:s', time() + 600),
        'ip' => client_ip(),
    ));
    return $code;
}

function otp_send($email, $code, $purpose, $name = '')
{
    if (config('DEV_SHOW_OTP', false)) {
        log_line('otp', $email . ' ' . $purpose . ' ' . $code);
    }
    $intro = $purpose === 'join'
        ? 'Use this code to verify your email and submit your BBA membership application.'
        : 'Use this code to reset your BBA password.';
    return send_mail(
        $email,
        'Your BBA verification code: ' . $code,
        ($name ? 'Hi ' . first_name($name) . ', ' : '') . 'here is your code',
        array($intro, otp_block($code), 'The code expires in 10 minutes. If you did not request it, you can ignore this email.')
    );
}

/** Throws on failure; returns true when the code is valid (and consumes it). */
function otp_verify($email, $purpose, $code)
{
    $row = one('SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', array($email, $purpose));
    $msg = 'That code is not valid. Check the email or request a new code.';
    if (!$row) {
        fail('otp_invalid', $msg, 422, array('code' => $msg));
    }
    if (strtotime($row['expires_at']) < time()) {
        fail('otp_expired', 'That code has expired. Request a new one.', 422, array('code' => 'That code has expired. Request a new one.'));
    }
    if ((int) $row['attempts'] >= 5) {
        fail('otp_dead', 'Too many wrong attempts. Request a new code.', 422, array('code' => 'Too many wrong attempts. Request a new code.'));
    }
    if (!preg_match('/^\d{6}$/', (string) $code) || !password_verify((string) $code, $row['code_hash'])) {
        $attempts = (int) $row['attempts'] + 1;
        q('UPDATE otp_codes SET attempts = ? WHERE id = ?', array($attempts, $row['id']));
        if ($attempts >= 5) {
            q('UPDATE otp_codes SET used_at = ? WHERE id = ?', array(now(), $row['id']));
            fail('otp_dead', 'Too many wrong attempts. Request a new code.', 422, array('code' => 'Too many wrong attempts. Request a new code.'));
        }
        $left = 5 - $attempts;
        fail('otp_invalid', 'Incorrect code. ' . $left . ' attempt' . ($left === 1 ? '' : 's') . ' left.', 422, array('code' => 'Incorrect code. ' . $left . ' attempt' . ($left === 1 ? '' : 's') . ' left.'));
    }
    q('UPDATE otp_codes SET used_at = ? WHERE id = ?', array(now(), $row['id']));
    return true;
}
