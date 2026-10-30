<?php

route('GET', 'auth/me', function () {
    $me = current_member();
    $out = array('member' => $me ? me_payload($me) : null, 'csrf' => $_SESSION['csrf']);
    if ($me) {
        $out['unread'] = (int) val('SELECT COUNT(*) FROM notifications WHERE member_id = ? AND read_at IS NULL', array($me['id']));
        $out['targets'] = array('ones' => (int) setting('target_121s', 4), 'referrals' => (int) setting('target_referrals', 2));
        if ($me['role'] === 'admin') {
            $out['pending_applications'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'pending_review'");
        }
    }
    ok($out);
}, array('public' => true));

route('POST', 'auth/login', function () {
    $v = new V();
    $id = $v->str('identifier', 'Email or mobile');
    $pass = $v->str('password', 'Password', true, 200);
    $v->done();
    $remember = in_val('remember', true) ? true : false;

    $ident = strtolower(trim($id));
    $mobile = normalize_mobile($ident);
    $since = date('Y-m-d H:i:s', time() - 900);
    $fails = (int) val('SELECT COUNT(*) FROM login_attempts WHERE identifier = ? AND ip = ? AND success = 0 AND created_at > ?', array($ident, client_ip(), $since));
    if ($fails >= 5) {
        fail('locked', 'Too many failed attempts. Please wait 15 minutes and try again.', 429);
    }

    $m = null;
    if (strpos($ident, '@') !== false) {
        $m = one('SELECT * FROM members WHERE email = ?', array($ident));
    } elseif (preg_match('/^\d{10}$/', $mobile)) {
        $m = one('SELECT * FROM members WHERE mobile = ?', array($mobile));
    }

    if (!$m || !password_verify($pass, $m['password_hash'])) {
        insert('login_attempts', array('identifier' => $ident, 'ip' => client_ip(), 'success' => 0));
        if ($fails + 1 >= 5) {
            audit('login_lockout', 'member', $m ? (int) $m['id'] : null, null, array('identifier' => $ident), null);
            fail('locked', 'Too many failed attempts. Please wait 15 minutes and try again.', 429);
        }
        fail('invalid_login', 'That email/mobile and password do not match.', 401);
    }

    if ($m['status'] === 'pending_review') {
        fail('pending_review', 'Your application is under review. The BBA team will email you once it is approved.', 403);
    }
    if ($m['status'] === 'rejected') {
        fail('rejected', 'Your application was not approved. Contact BBA at ' . setting('contact_email', '') . '.', 403);
    }
    if ($m['status'] === 'deactivated') {
        fail('deactivated', 'Your account is inactive. Please contact BBA.', 403);
    }

    insert('login_attempts', array('identifier' => $ident, 'ip' => client_ip(), 'success' => 1));
    login_member($m, $remember);
    audit('login', 'member', (int) $m['id'], null, null, (int) $m['id']);
    ok(array('member' => me_payload(current_member()), 'csrf' => $_SESSION['csrf']));
}, array('public' => true));

route('POST', 'auth/logout', function () {
    logout_session();
    ok(true);
}, array('public' => true));

route('POST', 'auth/logout-all', function () {
    $me = require_member();
    q('UPDATE members SET session_version = session_version + 1 WHERE id = ?', array($me['id']));
    logout_session();
    ok(true);
});

route('POST', 'auth/forgot', function () {
    $v = new V();
    $email = $v->email('email');
    $v->done();
    $m = one("SELECT * FROM members WHERE email = ? AND status = 'approved'", array($email));
    if ($m) {
        $code = otp_issue($email, 'reset', true);
        if ($code) {
            otp_send($email, $code, 'reset', $m['full_name']);
        }
    }
    ok(array('message' => "If that email is registered, we've sent a code."));
}, array('public' => true));

route('POST', 'auth/reset', function () {
    $v = new V();
    $email = $v->email('email');
    $code = $v->str('code', 'Code', true, 6);
    $pass = $v->str('password', 'New password', true, 200, 8);
    $v->done();
    otp_verify($email, 'reset', $code);
    $m = one('SELECT * FROM members WHERE email = ?', array($email));
    if (!$m) {
        fail('otp_invalid', 'That code is not valid.', 422);
    }
    q('UPDATE members SET password_hash = ?, session_version = session_version + 1, must_change_password = 0, updated_at = ? WHERE id = ?', array(password_hash($pass, PASSWORD_DEFAULT), now(), $m['id']));
    q('DELETE FROM login_attempts WHERE identifier = ?', array($email));
    audit('password_reset', 'member', (int) $m['id'], null, null, (int) $m['id']);
    ok(true);
}, array('public' => true));

route('POST', 'auth/change-password', function () {
    $me = require_member();
    $v = new V();
    $current = $v->str('current_password', 'Current password', true, 200);
    $pass = $v->str('password', 'New password', true, 200, 8);
    $v->done();
    if (!password_verify($current, $me['password_hash'])) {
        fail('validation', 'Your current password is incorrect.', 422, array('current_password' => 'Incorrect password.'));
    }
    if ($current === $pass) {
        fail('validation', 'Choose a password different from the current one.', 422, array('password' => 'Choose a different password.'));
    }
    q('UPDATE members SET password_hash = ?, session_version = session_version + 1, must_change_password = 0, updated_at = ? WHERE id = ?', array(password_hash($pass, PASSWORD_DEFAULT), now(), $me['id']));
    // Keep this device signed in; every other session dies on its next request.
    $_SESSION['session_version'] = (int) $me['session_version'] + 1;
    audit('password_changed', 'member', (int) $me['id']);
    ok(array('member' => me_payload(current_member(true))));
});
