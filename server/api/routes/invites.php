<?php
/**
 * Invite links. An admin invites someone by email; the link lets them fill in
 * their profile and choose a password, and they join already approved (the
 * admin vouched for them, and opening the emailed link proves the address).
 */

function invite_days()
{
    return 7;
}

function invite_state($inv)
{
    if ($inv['accepted_at']) {
        return 'accepted';
    }
    if ($inv['revoked_at']) {
        return 'revoked';
    }
    return $inv['expires_at'] < now() ? 'expired' : 'pending';
}

/** Issue a fresh token (old links stop working), email it, return [link, sent]. */
function invite_issue($id)
{
    $inv = one('SELECT i.*, m.full_name AS inviter FROM invites i LEFT JOIN members m ON m.id = i.invited_by WHERE i.id = ?', array($id));
    $token = rand_hex(24);
    update_row('invites', $id, array(
        'token_hash' => hash('sha256', $token),
        'expires_at' => date('Y-m-d H:i:s', time() + invite_days() * 86400),
        'last_sent_at' => now(),
    ));
    $link = app_url('/invite/' . $token);
    $paras = array(
        'Hi ' . first_name($inv['full_name']) . ',',
        ($inv['inviter'] ? $inv['inviter'] : 'The BBA team') . ' has invited you to join the Burhani Business Association'
            . ($inv['role'] === 'admin' ? ' as an administrator.' : '.'),
        'Use the button below to ' . ($inv['role'] === 'admin' ? 'set up your admin account' : 'set up your profile') . ' and choose a password. The link works once and expires in ' . invite_days() . ' days.',
    );
    $sent = send_mail($inv['email'], 'Your invitation to BBA', "You're invited to BBA", $paras, array('label' => 'Accept invitation', 'url' => $link));
    return array($link, $sent);
}

/** The pending invite for a raw token, or an error explaining why it can't be used. */
function invite_by_token($token)
{
    $token = (string) $token;
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        fail('invite_invalid', 'This invitation link is not valid. Check you copied the whole link.', 404);
    }
    $inv = one('SELECT i.*, m.full_name AS inviter FROM invites i LEFT JOIN members m ON m.id = i.invited_by WHERE i.token_hash = ?', array(hash('sha256', $token)));
    if (!$inv) {
        fail('invite_invalid', 'This invitation link is not valid, or a newer one was sent. Use the latest email from BBA.', 404);
    }
    $state = invite_state($inv);
    if ($state === 'accepted') {
        fail('invite_used', 'This invitation has already been used. Log in with your email and password.', 409);
    }
    if ($state === 'revoked') {
        fail('invite_revoked', 'This invitation was withdrawn. Contact BBA if you think this is a mistake.', 410);
    }
    if ($state === 'expired') {
        fail('invite_expired', 'This invitation has expired. Ask a BBA admin to send you a new one.', 410);
    }
    return $inv;
}

route('GET', 'admin/invites', function () {
    require_admin();
    $rows = all('SELECT i.id, i.email, i.full_name, i.mobile, i.role, i.expires_at, i.last_sent_at, i.accepted_at, i.revoked_at, i.member_id, i.created_at, m.full_name AS inviter
        FROM invites i LEFT JOIN members m ON m.id = i.invited_by ORDER BY i.id DESC LIMIT 200');
    foreach ($rows as $k => $r) {
        $rows[$k]['state'] = invite_state($r);
    }
    ok($rows);
});

route('POST', 'admin/invites/create', function () {
    $me = require_admin();
    $v = new V();
    $name = $v->str('full_name', 'Full name', true, 120, 2);
    $email = $v->email('email');
    $mobile = $v->mobile('mobile', 'Mobile number', false);
    $role = $v->enum('role', 'Role', array('member', 'admin'), false, 'member');
    $v->done();
    $existing = one('SELECT id, status FROM members WHERE email = ?', array($email));
    if ($existing) {
        $msg = $existing['status'] === 'pending_review'
            ? 'This person has already applied. Approve them under Applications instead.'
            : 'A member with this email already exists.';
        fail('validation', $msg, 422, array('email' => $msg));
    }
    if ($mobile && one('SELECT id FROM members WHERE mobile = ?', array($mobile))) {
        fail('validation', 'A member with this mobile number already exists.', 422, array('mobile' => 'Already registered.'));
    }
    // One live invite per email: a new one replaces any older pending link.
    q('UPDATE invites SET revoked_at = ?, updated_at = ? WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL', array(now(), now(), $email));
    $id = insert('invites', array(
        'token_hash' => rand_hex(32),
        'email' => $email,
        'full_name' => $name,
        'mobile' => $mobile,
        'role' => $role,
        'invited_by' => $me['id'],
        'expires_at' => now(),
    ));
    list($link, $sent) = invite_issue($id);
    audit('invite_sent', 'invite', $id, null, array('email' => $email, 'role' => $role));
    ok(array('id' => $id, 'link' => $link, 'sent' => $sent, 'email' => $email));
});

route('POST', 'admin/invites/resend', function () {
    require_admin();
    $inv = one('SELECT * FROM invites WHERE id = ?', array((int) in_val('id')));
    if (!$inv || $inv['accepted_at'] || $inv['revoked_at']) {
        fail('not_found', 'That invitation is no longer open.', 404);
    }
    list($link, $sent) = invite_issue((int) $inv['id']);
    audit('invite_resent', 'invite', (int) $inv['id'], null, array('email' => $inv['email']));
    ok(array('id' => (int) $inv['id'], 'link' => $link, 'sent' => $sent, 'email' => $inv['email']));
});

route('POST', 'admin/invites/revoke', function () {
    require_admin();
    $inv = one('SELECT * FROM invites WHERE id = ?', array((int) in_val('id')));
    if (!$inv || $inv['accepted_at'] || $inv['revoked_at']) {
        fail('not_found', 'That invitation is no longer open.', 404);
    }
    update_row('invites', (int) $inv['id'], array('revoked_at' => now()));
    audit('invite_revoked', 'invite', (int) $inv['id'], null, array('email' => $inv['email']));
    ok(true);
});

route('GET', 'invite/view', function () {
    $inv = invite_by_token(qs('token'));
    ok(array(
        'full_name' => $inv['full_name'],
        'email' => $inv['email'],
        'mobile' => $inv['mobile'],
        'role' => $inv['role'],
        'inviter' => $inv['inviter'],
        'expires_at' => $inv['expires_at'],
    ));
}, array('public' => true));

/** An admin account administers only: name, mobile and password, no member profile. */
function admin_account_validate($in)
{
    $v = new V($in);
    $d = array();
    $d['full_name'] = $v->str('full_name', 'Full name', true, 120, 2);
    $d['mobile'] = $v->mobile('mobile');
    $d['email'] = $v->email('email');
    $pass = $v->str('password', 'Password', true, 200, 8);
    $v->done();
    // its_number is required and unique on members; admins don't have one.
    $d['its_number'] = 'admin-' . rand_hex(6);
    $d['designation'] = 'Administrator';
    $d['password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
    return $d;
}

route('POST', 'invite/accept', function () {
    $inv = invite_by_token(in_val('token'));
    $in = input();
    $in['email'] = $inv['email'];
    $isAdmin = $inv['role'] === 'admin';
    $d = $isAdmin ? admin_account_validate($in) : join_validate($in);
    join_unique_check($d);
    $photo = save_avatar('photo');
    if (!$photo && !$isAdmin) {
        fail('validation', 'Please add a profile photo.', 422, array('photo' => 'Please add a profile photo.'));
    }
    if ($photo) {
        $d['photo_path'] = $photo;
    }
    $d['status'] = 'approved';
    $d['role'] = $isAdmin ? 'admin' : 'member';
    $d['email_verified_at'] = now();
    $d['approved_at'] = now();
    $d['approved_by'] = $inv['invited_by'];
    $id = insert('members', $d);
    update_row('invites', (int) $inv['id'], array('accepted_at' => now(), 'member_id' => $id));
    audit('invite_accepted', 'member', $id, null, array('email' => $d['email'], 'role' => $d['role']), $id);

    if ($isAdmin) {
        login_member(one('SELECT * FROM members WHERE id = ?', array($id)), true);
        ok(array('member' => me_payload(current_member()), 'csrf' => $_SESSION['csrf']));
    }

    // Same follow-ups as approving an application.
    q("UPDATE visitors SET joined_member_id = ?, status = 'joined', updated_at = ? WHERE mobile = ? AND joined_member_id IS NULL", array($id, now(), $d['mobile']));
    foreach (all('SELECT invited_by FROM visitors WHERE joined_member_id = ?', array($id)) as $vis) {
        notify($vis['invited_by'], 'visitor_joined', 'Your visitor ' . $d['full_name'] . ' joined BBA!', 'Thanks for growing the network.', '/app/visitors');
    }
    foreach (all("SELECT id FROM members WHERE status = 'approved' AND role = 'member' AND id <> ?", array($id)) as $mem) {
        notify($mem['id'], 'member_joined', 'New member: ' . $d['full_name'], $d['business_name'], '/app/members/' . $id);
    }
    notify($id, 'welcome', 'Welcome to BBA, ' . first_name($d['full_name']) . '!', 'Start by giving a referral or requesting a 121.', '/app');
    @unlink(PRIVATE_DIR . '/cache/public-stats.json');

    login_member(one('SELECT * FROM members WHERE id = ?', array($id)), true);
    ok(array('member' => me_payload(current_member()), 'csrf' => $_SESSION['csrf']));
}, array('public' => true));
