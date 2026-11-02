<?php
/**
 * Admin panel. Every route calls require_admin(); every edit is audited.
 */

/* ---------------------------- Overview ---------------------------- */

route('GET', 'admin/overview', function () {
    require_admin();
    list($from, $to) = range_from_query();
    $s = stats_for(null, $from, $to);
    $s['members_total'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'approved' AND role = 'member'");
    $s['pending_applications'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'pending_review'");
    $toDt = $to . ' 23:59:59';
    $active = all("SELECT giver_id AS mid FROM referrals WHERE is_void = 0 AND referral_date BETWEEN ? AND ?
        UNION SELECT receiver_id FROM referrals WHERE is_void = 0 AND referral_date BETWEEN ? AND ?
        UNION SELECT requester_id FROM one_to_ones WHERE status = 'completed' AND meeting_at BETWEEN ? AND ?
        UNION SELECT partner_id FROM one_to_ones WHERE status = 'completed' AND meeting_at BETWEEN ? AND ?
        UNION SELECT invited_by FROM visitors WHERE invited_date BETWEEN ? AND ?",
        array($from, $to, $from, $to, $from . ' 00:00:00', $toDt, $from . ' 00:00:00', $toDt, $from, $to));
    $s['members_active'] = count($active);

    $cb = chart_buckets($from, $to, val('SELECT MIN(referral_date) FROM referrals'));
    $trend = array();
    foreach ($cb['buckets'] as $k => $label) {
        $trend[$k] = array('label' => $label, 'referrals' => 0, 'business' => 0, 'ones' => 0);
    }
    foreach (all("SELECT referral_date AS d, COUNT(*) AS n FROM referrals WHERE type='referral' AND " . LIVE_REF . ' AND referral_date BETWEEN ? AND ? GROUP BY referral_date', array($from, $to)) as $r) {
        $k = bucket_key($r['d'], $cb['grain']);
        if (isset($trend[$k])) {
            $trend[$k]['referrals'] += (int) $r['n'];
        }
    }
    foreach (all("SELECT won_date AS d, SUM(final_value) AS v FROM referrals WHERE status='won' AND " . LIVE_REF . ' AND won_date BETWEEN ? AND ? GROUP BY won_date', array($from, $to)) as $r) {
        $k = bucket_key($r['d'], $cb['grain']);
        if (isset($trend[$k])) {
            $trend[$k]['business'] += (float) $r['v'];
        }
    }
    foreach (all("SELECT SUBSTR(meeting_at,1,10) AS d, COUNT(*) AS n FROM one_to_ones WHERE status='completed' AND meeting_at BETWEEN ? AND ? GROUP BY SUBSTR(meeting_at,1,10)", array($from . ' 00:00:00', $toDt)) as $r) {
        $k = bucket_key($r['d'], $cb['grain']);
        if (isset($trend[$k])) {
            $trend[$k]['ones'] += (int) $r['n'];
        }
    }

    $byCat = all("SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(r.final_value) AS value FROM referrals r JOIN members m ON m.id = r.receiver_id
        LEFT JOIN categories c ON c.id = m.category_id WHERE r.status = 'won' AND r.is_void = 0 AND r.is_disputed = 0 AND r.won_date BETWEEN ? AND ?
        GROUP BY c.name ORDER BY value DESC LIMIT 10", array($from, $to));

    $top = all("SELECT m.id, m.full_name, m.business_name, SUM(r.final_value) AS value FROM referrals r JOIN members m ON m.id = r.giver_id
        WHERE r.status = 'won' AND r.is_void = 0 AND r.is_disputed = 0 AND r.won_date BETWEEN ? AND ?
        GROUP BY m.id, m.full_name, m.business_name ORDER BY value DESC LIMIT 10", array($from, $to));

    $mf = date('Y-m-01');
    $mt = date('Y-m-t');
    $zero = all("SELECT m.id, m.full_name, m.business_name, m.mobile, m.photo_path FROM members m WHERE m.status = 'approved' AND m.role = 'member'
        AND NOT EXISTS (SELECT 1 FROM referrals r WHERE (r.giver_id = m.id OR r.receiver_id = m.id) AND r.referral_date BETWEEN ? AND ?)
        AND NOT EXISTS (SELECT 1 FROM one_to_ones o WHERE (o.requester_id = m.id OR o.partner_id = m.id) AND o.meeting_at BETWEEN ? AND ?)
        AND NOT EXISTS (SELECT 1 FROM visitors v WHERE v.invited_by = m.id AND v.invited_date BETWEEN ? AND ?)
        ORDER BY m.full_name", array($mf, $mt, $mf . ' 00:00:00', $mt . ' 23:59:59', $mf, $mt));
    foreach ($zero as $i => $z) {
        $zero[$i]['photo_url'] = photo_url($z['photo_path']);
        unset($zero[$i]['photo_path']);
    }

    ok(array('from' => $from, 'to' => $to, 'stats' => $s, 'trend' => array_values($trend), 'trend_grain' => $cb['grain'],'by_category' => $byCat, 'top' => $top, 'zero_activity' => $zero));
});

/* -------------------------- Applications -------------------------- */

route('GET', 'admin/applications', function () {
    require_admin();
    $cols = 'm.*, c.name AS category_name, ap.full_name AS approver_name';
    $base = 'SELECT ' . $cols . ' FROM members m LEFT JOIN categories c ON c.id = m.category_id LEFT JOIN members ap ON ap.id = m.approved_by';
    $pending = all($base . " WHERE m.status = 'pending_review' ORDER BY m.created_at ASC");
    $history = all($base . " WHERE m.status IN ('approved','rejected') AND m.approved_by IS NOT NULL ORDER BY m.approved_at DESC LIMIT 100");
    $clean = function ($rows) {
        $out = array();
        foreach ($rows as $r) {
            unset($r['password_hash'], $r['session_version']);
            $r['photo_url'] = photo_url($r['photo_path']);
            $r['offers'] = split_tags($r['offers']);
            $r['looking_for'] = split_tags($r['looking_for']);
            $r['visitor_link'] = one('SELECT v.code, im.full_name AS inviter FROM visitors v JOIN members im ON im.id = v.invited_by WHERE v.joined_member_id = ? LIMIT 1', array($r['id']));
            $out[] = $r;
        }
        return $out;
    };
    ok(array('pending' => $clean($pending), 'history' => $clean($history)));
});

route('POST', 'admin/applications/decide', function () {
    $me = require_admin();
    $v = new V();
    $id = $v->int('id', 'Application');
    $action = $v->enum('action', 'Action', array('approve', 'reject'));
    $note = $v->str('note', $action === 'reject' ? 'Internal reason' : 'Welcome note', $action === 'reject', 1000);
    $v->done();
    $m = one("SELECT * FROM members WHERE id = ? AND status = 'pending_review'", array($id));
    if (!$m) {
        fail('not_found', 'That application is no longer pending.', 404);
    }
    if ($action === 'approve') {
        update_row('members', $id, array('status' => 'approved', 'approved_at' => now(), 'approved_by' => $me['id']));
        audit('member_approved', 'member', $id, array('status' => 'pending_review'), array('status' => 'approved'));
        q("UPDATE visitors SET status = 'joined', updated_at = ? WHERE joined_member_id = ?", array(now(), $id));
        foreach (all("SELECT invited_by FROM visitors WHERE joined_member_id = ?", array($id)) as $vis) {
            notify($vis['invited_by'], 'visitor_joined', 'Your visitor ' . $m['full_name'] . ' joined BBA!', 'Thanks for growing the network.', '/app/visitors');
        }
        foreach (all("SELECT id FROM members WHERE status = 'approved' AND role = 'member' AND id <> ?", array($id)) as $mem) {
            notify($mem['id'], 'member_joined', 'New member: ' . $m['full_name'], $m['business_name'], '/app/members/' . $id);
        }
        notify($id, 'welcome', 'Welcome to BBA, ' . first_name($m['full_name']) . '!', 'Start by giving a referral or requesting a 121.', '/app');
        $paras = array('Hi ' . first_name($m['full_name']) . ',', 'Your application to the Burhani Business Association has been approved. Welcome aboard!');
        if ($note) {
            $paras[] = $note;
        }
        $paras[] = 'Log in with your email or mobile number and the password you chose when applying.';
        send_mail($m['email'], 'Welcome to BBA', 'Welcome to BBA', $paras, array('label' => 'Log in to BBA', 'url' => app_url('/login')));
    } else {
        update_row('members', $id, array('status' => 'rejected', 'rejection_reason' => $note, 'approved_at' => now(), 'approved_by' => $me['id']));
        audit('member_rejected', 'member', $id, array('status' => 'pending_review'), array('status' => 'rejected', 'reason' => $note));
        send_mail($m['email'], 'Your BBA application', 'About your application', array(
            'Hi ' . first_name($m['full_name']) . ',',
            'Thank you for your interest in the Burhani Business Association. We are unable to approve your application at this time.',
            'If you have questions, reply to this email or contact ' . setting('contact_email', 'BBA') . '.',
        ));
    }
    ok(true);
});

route('POST', 'admin/applications/request-info', function () {
    require_admin();
    $v = new V();
    $id = $v->int('id', 'Application');
    $msg = $v->str('message', 'Message', true, 2000);
    $v->done();
    $m = one('SELECT * FROM members WHERE id = ?', array($id));
    if (!$m) {
        fail('not_found', 'Applicant not found.', 404);
    }
    $sent = send_mail($m['email'], 'BBA needs a little more information', 'A quick question about your application', array('Hi ' . first_name($m['full_name']) . ',', $msg, 'Please reply to this email with the details.'));
    audit('application_info_requested', 'member', $id, null, array('message' => $msg));
    if (!$sent) {
        fail('mail_failed', 'The email could not be sent. Check the email settings.', 502);
    }
    ok(true);
});

/* ----------------------------- Members ---------------------------- */

route('GET', 'admin/members', function () {
    require_admin();
    $where = array("m.status <> 'pending_review'");
    $params = array();
    if (qs('q')) {
        $like = '%' . qs('q') . '%';
        $where[] = '(m.full_name LIKE ? OR m.business_name LIKE ? OR m.email LIKE ? OR m.mobile LIKE ? OR m.its_number LIKE ? OR m.city LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like, $like);
    }
    if (qs('status')) {
        $where[] = 'm.status = ?';
        $params[] = qs('status');
    }
    if (qs('role')) {
        $where[] = 'm.role = ?';
        $params[] = qs('role');
    }
    $sort = qs('sort', 'name');
    $sorts = array('name' => 'm.full_name ASC', 'joined' => 'm.approved_at DESC', 'login' => 'm.last_login_at DESC', 'business' => 'business_given DESC', 'referrals' => 'referrals_given DESC');
    $order = isset($sorts[$sort]) ? $sorts[$sort] : $sorts['name'];
    $rows = all("SELECT m.id, m.full_name, m.business_name, m.email, m.mobile, m.its_number, m.city, m.status, m.role, m.photo_path, m.approved_at, m.created_at, m.last_login_at,
        COALESCE(c.name, '') AS category_name,
        (SELECT COUNT(*) FROM referrals r WHERE r.giver_id = m.id AND r.type = 'referral' AND r.is_void = 0 AND r.is_disputed = 0) AS referrals_given,
        (SELECT COALESCE(SUM(r.final_value),0) FROM referrals r WHERE r.giver_id = m.id AND r.status = 'won' AND r.is_void = 0 AND r.is_disputed = 0) AS business_given
        FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE " . implode(' AND ', $where) . ' ORDER BY ' . $order, $params);
    foreach ($rows as $i => $r) {
        $rows[$i]['photo_url'] = photo_url($r['photo_path']);
        unset($rows[$i]['photo_path']);
    }
    ok($rows);
});

route('GET', 'admin/members/view', function () {
    require_admin();
    $m = one('SELECT m.*, c.name AS category_name FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?', array(qs_int('id')));
    if (!$m) {
        fail('not_found', 'Member not found.', 404);
    }
    unset($m['password_hash']);
    $m['photo_url'] = photo_url($m['photo_path']);
    $m['offers'] = split_tags($m['offers']);
    $m['looking_for'] = split_tags($m['looking_for']);
    $id = (int) $m['id'];
    // Everything below follows the admin's selected period (all time when none is sent).
    $c = custom_range();
    list($from, $to) = $c ? $c : array('2000-01-01', '2999-12-31');
    $shape = function ($rows) use ($id) {
        $out = array();
        foreach ($rows as $r) {
            $out[] = referral_shape($r, $id);
        }
        return $out;
    };
    // Business received and business generated for others are kept apart, never mixed.
    $won = " AND r.status = 'won' AND r.won_date BETWEEN ? AND ? ORDER BY r.won_date DESC, r.id DESC LIMIT 200";
    $received = $shape(all(referral_select() . ' WHERE r.receiver_id = ?' . $won, array($id, $from, $to)));
    $generated = $shape(all(referral_select() . ' WHERE r.giver_id = ?' . $won, array($id, $from, $to)));
    $refs = $shape(all(referral_select() . " WHERE (r.giver_id = ? OR r.receiver_id = ?) AND r.type = 'referral' AND r.referral_date BETWEEN ? AND ? ORDER BY r.referral_date DESC, r.id DESC LIMIT 200", array($id, $id, $from, $to)));
    $ones = array();
    foreach (all(ones_select() . ' WHERE (o.requester_id = ? OR o.partner_id = ?) AND o.meeting_at BETWEEN ? AND ? ORDER BY o.meeting_at DESC LIMIT 200', array($id, $id, $from . ' 00:00:00', $to . ' 23:59:59')) as $o) {
        $ones[] = one_shape($o, $id);
    }
    ok(array(
        'member' => $m,
        'from' => $from,
        'to' => $to,
        'stats' => stats_for($id, $from, $to),
        'attendance' => attendance_pct($id, $from, $to),
        'business_received' => $received,
        'business_generated' => $generated,
        'referrals' => $refs,
        'ones' => $ones,
        'visitors' => all('SELECT * FROM visitors WHERE invited_by = ? AND invited_date BETWEEN ? AND ? ORDER BY id DESC', array($id, $from, $to)),
    ));
});

route('POST', 'admin/members/update', function () {
    require_admin();
    $id = (int) in_val('id');
    $before = one('SELECT * FROM members WHERE id = ?', array($id));
    if (!$before) {
        fail('not_found', 'Member not found.', 404);
    }
    $v = new V();
    $d = profile_fields_from($v);
    $d['email'] = $v->email('email');
    $d['its_number'] = $v->str('its_number', 'ITS number', true, 20);
    $v->done();
    $dupe = array();
    if (one('SELECT id FROM members WHERE email = ? AND id <> ?', array($d['email'], $id))) {
        $dupe['email'] = 'Another member uses this email.';
    }
    if (one('SELECT id FROM members WHERE mobile = ? AND id <> ?', array($d['mobile'], $id))) {
        $dupe['mobile'] = 'Another member uses this mobile.';
    }
    if (one('SELECT id FROM members WHERE its_number = ? AND id <> ?', array($d['its_number'], $id))) {
        $dupe['its_number'] = 'Another member uses this ITS number.';
    }
    if ($dupe) {
        fail('validation', reset($dupe), 422, $dupe);
    }
    update_row('members', $id, $d);
    list($b, $a) = diff_pair($before, $d);
    if ($a) {
        audit('member_edited', 'member', $id, $b, $a);
    }
    ok(true);
});

route('POST', 'admin/members/status', function () {
    $me = require_admin();
    $id = (int) in_val('id');
    $status = in_val('status');
    if (!in_array($status, array('approved', 'deactivated'), true)) {
        fail('validation', 'Invalid status.', 422);
    }
    $m = one('SELECT * FROM members WHERE id = ?', array($id));
    if (!$m) {
        fail('not_found', 'Member not found.', 404);
    }
    if ($id === (int) $me['id']) {
        fail('forbidden', 'You cannot deactivate your own account.', 403);
    }
    if ($status === 'deactivated' && $m['role'] === 'admin' && (int) val("SELECT COUNT(*) FROM members WHERE role = 'admin' AND status = 'approved'") <= 1) {
        fail('forbidden', 'You cannot deactivate the last admin.', 403);
    }
    q('UPDATE members SET status = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?', array($status, now(), $id));
    audit($status === 'approved' ? 'member_reactivated' : 'member_deactivated', 'member', $id, array('status' => $m['status']), array('status' => $status));
    ok(true);
});

route('POST', 'admin/members/role', function () {
    $me = require_admin();
    $id = (int) in_val('id');
    $role = in_val('role');
    if (!in_array($role, array('member', 'admin'), true)) {
        fail('validation', 'Invalid role.', 422);
    }
    $m = one('SELECT * FROM members WHERE id = ?', array($id));
    if (!$m || $m['status'] !== 'approved') {
        fail('not_found', 'Only active members can change role.', 404);
    }
    if ($role === 'member' && $m['role'] === 'admin' && (int) val("SELECT COUNT(*) FROM members WHERE role = 'admin' AND status = 'approved'") <= 1) {
        fail('forbidden', 'There must be at least one admin.', 403);
    }
    if ($role === 'member' && $m['role'] === 'admin' && trim((string) $m['business_name']) === '') {
        fail('forbidden', 'This admin account was set up without a member profile. Invite them as a member instead.', 403);
    }
    q('UPDATE members SET role = ?, updated_at = ? WHERE id = ?', array($role, now(), $id));
    audit('role_changed', 'member', $id, array('role' => $m['role']), array('role' => $role));
    if ($id === (int) $me['id']) {
        $_SESSION['role'] = $role;
    }
    ok(true);
});

route('POST', 'admin/members/reset-password', function () {
    require_admin();
    $m = one("SELECT * FROM members WHERE id = ? AND status = 'approved'", array((int) in_val('id')));
    if (!$m) {
        fail('not_found', 'Member not found.', 404);
    }
    $code = otp_issue($m['email'], 'reset');
    $sent = send_mail($m['email'], 'Reset your BBA password', 'Reset your password', array(
        'Hi ' . first_name($m['full_name']) . ', a BBA admin started a password reset for your account.',
        otp_block($code),
        'Open the link below, enter your email and this code, then choose a new password. The code expires in 10 minutes.',
    ), array('label' => 'Reset password', 'url' => app_url('/forgot-password?email=' . rawurlencode($m['email']) . '&step=code')));
    audit('password_reset_sent', 'member', (int) $m['id']);
    if (!$sent) {
        fail('mail_failed', 'The email could not be sent. Check the email settings.', 502);
    }
    ok(true);
});

/* ----------------------------- Records ---------------------------- */

route('GET', 'admin/records', function () {
    require_admin();
    $type = qs('type', 'referrals');
    $mid = qs_int('member_id');
    $status = qs('status');
    list($from, $to) = array(qs('from'), qs('to'));
    $page = max(1, qs_int('page', 1));
    $per = 30;
    $off = ($page - 1) * $per;
    if ($type === '121s') {
        $where = array('1=1');
        $p = array();
        if ($mid) {
            $where[] = '(o.requester_id = ? OR o.partner_id = ?)';
            array_push($p, $mid, $mid);
        }
        if ($status) {
            $where[] = 'o.status = ?';
            $p[] = $status;
        }
        if ($from && $to) {
            $where[] = 'o.meeting_at BETWEEN ? AND ?';
            array_push($p, $from . ' 00:00:00', $to . ' 23:59:59');
        }
        $w = ' WHERE ' . implode(' AND ', $where);
        $total = (int) val('SELECT COUNT(*) FROM one_to_ones o' . $w, $p);
        $items = all(ones_select() . $w . ' ORDER BY o.meeting_at DESC LIMIT ' . $per . ' OFFSET ' . $off, $p);
        foreach ($items as $i => $o) {
            $items[$i] = array_diff_key($o, array('requester_photo' => 1, 'partner_photo' => 1));
            $items[$i]['effective_status'] = ($o['status'] === 'scheduled' && strtotime($o['meeting_at']) <= time()) ? 'awaiting_confirmation' : $o['status'];
        }
        ok(array('items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $per));
    }
    if ($type === 'visitors') {
        $where = array('1=1');
        $p = array();
        if ($mid) {
            $where[] = 'v.invited_by = ?';
            $p[] = $mid;
        }
        if ($status) {
            $where[] = 'v.status = ?';
            $p[] = $status;
        }
        if ($from && $to) {
            $where[] = 'v.invited_date BETWEEN ? AND ?';
            array_push($p, $from, $to);
        }
        $w = ' WHERE ' . implode(' AND ', $where);
        $total = (int) val('SELECT COUNT(*) FROM visitors v' . $w, $p);
        $items = all('SELECT v.*, m.full_name AS inviter_name, mt.title AS meeting_title FROM visitors v JOIN members m ON m.id = v.invited_by LEFT JOIN meetings mt ON mt.id = v.meeting_id' . $w . ' ORDER BY v.id DESC LIMIT ' . $per . ' OFFSET ' . $off, $p);
        ok(array('items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $per));
    }
    if ($type === 'testimonials') {
        $where = array('1=1');
        $p = array();
        if ($mid) {
            $where[] = '(t.author_id = ? OR t.subject_id = ?)';
            array_push($p, $mid, $mid);
        }
        $w = ' WHERE ' . implode(' AND ', $where);
        $total = (int) val('SELECT COUNT(*) FROM testimonials t' . $w, $p);
        $items = all('SELECT t.*, a.full_name AS author_name, s.full_name AS subject_name FROM testimonials t JOIN members a ON a.id = t.author_id JOIN members s ON s.id = t.subject_id' . $w . ' ORDER BY t.id DESC LIMIT ' . $per . ' OFFSET ' . $off, $p);
        ok(array('items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $per));
    }
    $where = array('1=1');
    $p = array();
    if ($mid) {
        $where[] = '(r.giver_id = ? OR r.receiver_id = ?)';
        array_push($p, $mid, $mid);
    }
    if ($status) {
        $where[] = 'r.status = ?';
        $p[] = $status;
    }
    if (qs('disputed') === '1') {
        $where[] = 'r.is_disputed = 1 AND r.is_void = 0';
    }
    if ($from && $to) {
        $where[] = 'r.referral_date BETWEEN ? AND ?';
        array_push($p, $from, $to);
    }
    if (qs('q')) {
        $like = '%' . qs('q') . '%';
        $where[] = '(r.code LIKE ? OR r.client_name LIKE ? OR r.requirement LIKE ?)';
        array_push($p, $like, $like, $like);
    }
    $w = ' WHERE ' . implode(' AND ', $where);
    $total = (int) val('SELECT COUNT(*) FROM referrals r' . $w, $p);
    $rows = all(referral_select() . $w . ' ORDER BY r.id DESC LIMIT ' . $per . ' OFFSET ' . $off, $p);
    $items = array();
    foreach ($rows as $r) {
        $items[] = referral_shape($r);
    }
    ok(array('items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $per));
});

route('POST', 'admin/records/update', function () {
    require_admin();
    $r = one('SELECT * FROM referrals WHERE id = ?', array((int) in_val('id')));
    if (!$r) {
        fail('not_found', 'Record not found.', 404);
    }
    $v = new V();
    $d = array(
        'client_name' => $v->str('client_name', 'Client name', false, 150),
        'requirement' => $v->str('requirement', 'Requirement', true, 255),
        'estimated_value' => $v->money('estimated_value', 'Estimated value', false),
        'status' => $v->enum('status', 'Status', referral_statuses()),
        'final_value' => $v->money('final_value', 'Final value', false),
        'won_date' => $v->date('won_date', 'Won date', false),
        'referral_date' => $v->date('referral_date', 'Referral date'),
    );
    if ($d['status'] === 'won' && !$d['final_value']) {
        $v->error('final_value', 'A won record needs a final value.');
    }
    $v->done();
    if ($d['client_name'] === null) {
        $d['client_name'] = '';
    }
    if ($d['status'] === 'won' && !$d['won_date']) {
        $d['won_date'] = today();
    }
    if ($d['status'] !== 'won') {
        $d['final_value'] = null;
        $d['won_date'] = null;
    }
    update_row('referrals', $r['id'], $d);
    list($b, $a) = diff_pair($r, $d);
    if ($a) {
        audit('record_edited', 'referral', (int) $r['id'], $b, $a);
        referral_event($r['id'], 'edit', 'Edited by admin');
    }
    ok(true);
});

route('POST', 'admin/records/void', function () {
    require_admin();
    $table = in_val('type') === '121s' ? 'one_to_ones' : 'referrals';
    $row = one('SELECT * FROM ' . $table . ' WHERE id = ?', array((int) in_val('id')));
    if (!$row) {
        fail('not_found', 'Record not found.', 404);
    }
    if ($table === 'referrals') {
        update_row('referrals', $row['id'], array('is_void' => in_val('restore') ? 0 : 1));
        referral_event($row['id'], 'resolve', in_val('restore') ? 'Restored by admin' : 'Voided by admin');
    } else {
        update_row('one_to_ones', $row['id'], array('status' => 'cancelled'));
    }
    audit(in_val('restore') ? 'record_restored' : 'record_voided', $table === 'referrals' ? 'referral' : '121', (int) $row['id']);
    ok(true);
});

route('POST', 'admin/records/resolve-dispute', function () {
    require_admin();
    $r = one('SELECT * FROM referrals WHERE id = ?', array((int) in_val('id')));
    if (!$r || !$r['is_disputed']) {
        fail('not_found', 'This record is not disputed.', 404);
    }
    $action = in_val('action');
    if (!in_array($action, array('keep', 'void'), true)) {
        fail('validation', 'Choose keep or void.', 422);
    }
    $d = array('is_disputed' => 0);
    if ($action === 'void') {
        $d['is_void'] = 1;
    }
    update_row('referrals', $r['id'], $d);
    referral_event($r['id'], 'resolve', $action === 'void' ? 'Dispute resolved — record voided' : 'Dispute resolved — record kept');
    audit('dispute_resolved', 'referral', (int) $r['id'], array('is_disputed' => 1), array('action' => $action));
    $msg = $r['code'] . ' dispute resolved: ' . ($action === 'void' ? 'record voided' : 'record kept');
    notify($r['giver_id'], 'disputed', $msg, null, '/app/referrals/' . $r['code']);
    notify($r['receiver_id'], 'disputed', $msg, null, '/app/referrals/' . $r['code']);
    ok(true);
});

route('POST', 'admin/121s/force-confirm', function () {
    $me = require_admin();
    $o = one('SELECT * FROM one_to_ones WHERE id = ?', array((int) in_val('id')));
    if (!$o || $o['status'] === 'completed') {
        fail('not_found', 'This 121 cannot be confirmed.', 404);
    }
    update_row('one_to_ones', $o['id'], array('status' => 'completed', 'confirmed_at' => now(), 'force_confirmed_by' => $me['id']));
    audit('121_force_confirmed', '121', (int) $o['id'], array('status' => $o['status']), array('status' => 'completed'));
    ok(true);
});

/* --------------------------- Meetings ----------------------------- */

route('GET', 'admin/meetings', function () {
    require_admin();
    $rows = all("SELECT mt.*,
        (SELECT COUNT(*) FROM attendance a WHERE a.meeting_id = mt.id AND a.status = 'present') AS present_count,
        (SELECT COUNT(*) FROM attendance a WHERE a.meeting_id = mt.id) AS marked_count,
        (SELECT COUNT(*) FROM visitors v WHERE v.meeting_id = mt.id) AS visitors_count
        FROM meetings mt ORDER BY mt.meeting_date DESC, mt.start_time DESC");
    ok($rows);
});

route('POST', 'admin/meetings/save', function () {
    require_admin();
    $v = new V();
    $id = $v->int('id', 'Meeting', false);
    $d = array(
        'title' => $v->str('title', 'Title', true, 150),
        'meeting_date' => $v->date('meeting_date', 'Date'),
        'start_time' => $v->str('start_time', 'Start time', true, 5),
        'venue' => $v->str('venue', 'Venue', false, 255),
        'online_link' => $v->url('online_link', 'Online link'),
        'notes' => $v->str('notes', 'Notes', false, 2000),
    );
    if ($d['start_time'] && !preg_match('/^\d{2}:\d{2}$/', $d['start_time'])) {
        $v->error('start_time', 'Enter a valid time.');
    }
    $v->done();
    if ($id) {
        $before = one('SELECT * FROM meetings WHERE id = ?', array($id));
        if (!$before) {
            fail('not_found', 'Meeting not found.', 404);
        }
        update_row('meetings', $id, $d);
        list($b, $a) = diff_pair($before, $d);
        audit('meeting_edited', 'meeting', $id, $b, $a);
    } else {
        $id = insert('meetings', $d);
        audit('meeting_created', 'meeting', $id, null, $d);
    }
    ok(array('id' => $id));
});

route('GET', 'admin/attendance', function () {
    require_admin();
    $mid = qs_int('meeting_id');
    $mt = one('SELECT * FROM meetings WHERE id = ?', array($mid));
    if (!$mt) {
        fail('not_found', 'Meeting not found.', 404);
    }
    $members = all("SELECT m.id, m.full_name, m.business_name, m.photo_path, a.status FROM members m
        LEFT JOIN attendance a ON a.member_id = m.id AND a.meeting_id = ?
        WHERE m.role = 'member' AND (m.status = 'approved' OR a.status IS NOT NULL) ORDER BY m.full_name", array($mid));
    foreach ($members as $i => $m) {
        $members[$i]['photo_url'] = photo_url($m['photo_path']);
        unset($members[$i]['photo_path']);
    }
    $visitors = all('SELECT v.id, v.name, v.business, v.status, m.full_name AS inviter_name FROM visitors v JOIN members m ON m.id = v.invited_by WHERE v.meeting_id = ? ORDER BY v.name', array($mid));
    ok(array('meeting' => $mt, 'members' => $members, 'visitors' => $visitors));
});

route('POST', 'admin/attendance/save', function () {
    require_admin();
    $mid = (int) in_val('meeting_id');
    if (!one('SELECT id FROM meetings WHERE id = ?', array($mid))) {
        fail('not_found', 'Meeting not found.', 404);
    }
    $marks = in_val('members', array());
    $n = 0;
    if (is_array($marks)) {
        foreach ($marks as $memberId => $status) {
            if ($status === 'excused') {
                $status = 'substitute'; // an app version from before the rename
            }
            if (!in_array($status, array('present', 'absent', 'substitute'), true)) {
                continue;
            }
            $ex = one('SELECT id FROM attendance WHERE meeting_id = ? AND member_id = ?', array($mid, (int) $memberId));
            if ($ex) {
                update_row('attendance', $ex['id'], array('status' => $status));
            } else {
                insert('attendance', array('meeting_id' => $mid, 'member_id' => (int) $memberId, 'status' => $status));
            }
            $n++;
        }
    }
    $vis = in_val('visitors', array());
    if (is_array($vis)) {
        foreach ($vis as $vid => $attended) {
            $row = one('SELECT * FROM visitors WHERE id = ? AND meeting_id = ?', array((int) $vid, $mid));
            if (!$row || in_array($row['status'], array('joined', 'not_interested'), true)) {
                continue;
            }
            update_row('visitors', $row['id'], array('status' => $attended ? 'attended' : 'invited'));
        }
    }
    audit('attendance_saved', 'meeting', $mid, null, array('marked' => $n));
    ok(true);
});

/* ----------------------------- Reports ---------------------------- */

route('GET', 'admin/reports', function () {
    require_admin();
    list($from, $to) = range_from_query();
    $kind = qs('kind', 'members');
    $toDt = $to . ' 23:59:59';
    if ($kind === 'categories') {
        $rows = all("SELECT COALESCE(c.name, 'Uncategorised') AS category,
            (SELECT COUNT(*) FROM members m WHERE m.category_id = c.id AND m.status = 'approved') AS members,
            (SELECT COUNT(*) FROM referrals r JOIN members m ON m.id = r.receiver_id WHERE m.category_id = c.id AND r.type = 'referral' AND r.is_void = 0 AND r.is_disputed = 0 AND r.referral_date BETWEEN ? AND ?) AS referrals_received,
            (SELECT COALESCE(SUM(r.final_value),0) FROM referrals r JOIN members m ON m.id = r.receiver_id WHERE m.category_id = c.id AND r.status = 'won' AND r.is_void = 0 AND r.is_disputed = 0 AND r.won_date BETWEEN ? AND ?) AS business_value
            FROM categories c ORDER BY business_value DESC, c.name", array($from, $to, $from, $to));
        ok(array('from' => $from, 'to' => $to, 'rows' => $rows));
    }
    if ($kind === 'summary') {
        $s = stats_for(null, $from, $to);
        $s['members_total'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'approved' AND role = 'member'");
        $s['new_members'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'approved' AND approved_at BETWEEN ? AND ?", array($from . ' 00:00:00', $toDt));
        $s['meetings_held'] = (int) val('SELECT COUNT(*) FROM meetings WHERE meeting_date BETWEEN ? AND ?', array($from, $to));
        ok(array('from' => $from, 'to' => $to, 'summary' => $s));
    }
    if ($kind === 'raw') {
        $refs = all("SELECT r.code, r.type, g.full_name AS giver, rc.full_name AS receiver, r.client_name, r.client_phone, r.client_email, r.requirement, r.description,
            r.estimated_value, r.referral_date, r.status, r.final_value, r.won_date, r.thank_you_note, r.lost_reason, r.is_disputed, r.dispute_reason, r.is_void, r.created_at
            FROM referrals r JOIN members g ON g.id = r.giver_id JOIN members rc ON rc.id = r.receiver_id WHERE r.referral_date BETWEEN ? AND ? ORDER BY r.id", array($from, $to));
        $ones = all("SELECT o.code, a.full_name AS requester, b.full_name AS partner, o.meeting_at, o.mode, o.status, o.business_discussed, o.products_introduced,
            o.referrals_exchanged, o.follow_up_actions, o.requester_notes, o.partner_notes, o.confirmed_at, o.created_at
            FROM one_to_ones o JOIN members a ON a.id = o.requester_id JOIN members b ON b.id = o.partner_id WHERE o.meeting_at BETWEEN ? AND ? ORDER BY o.id", array($from . ' 00:00:00', $toDt));
        $vis = all("SELECT v.code, v.name, v.mobile, v.business, v.category, m.full_name AS invited_by, mt.title AS meeting, v.invited_date, v.status, v.notes
            FROM visitors v JOIN members m ON m.id = v.invited_by LEFT JOIN meetings mt ON mt.id = v.meeting_id WHERE v.invited_date BETWEEN ? AND ? ORDER BY v.id", array($from, $to));
        $mems = all("SELECT m.id, m.full_name, m.email, m.mobile, m.its_number, m.status, m.role, m.business_name, COALESCE(c.name, '') AS category, m.category_other, m.designation, m.city, m.address, m.website, m.offers, m.looking_for, m.approved_at, m.last_login_at
            FROM members m LEFT JOIN categories c ON c.id = m.category_id ORDER BY m.id");
        ok(array('from' => $from, 'to' => $to, 'referrals' => $refs, 'ones' => $ones, 'visitors' => $vis, 'members' => $mems));
    }
    // Member-wise performance
    $target = (int) setting('target_121s', 4);
    $months = max(1, (int) round((strtotime($to) - strtotime($from)) / (30.44 * 86400)));
    $rows = array();
    foreach (all("SELECT m.id, m.full_name, m.business_name, COALESCE(c.name, '') AS category FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE m.status = 'approved' ORDER BY m.full_name") as $m) {
        $s = stats_for((int) $m['id'], $from, $to);
        $rows[] = array_merge($m, $s, array(
            'ones_target' => $target * $months,
            'attendance_pct' => attendance_pct((int) $m['id'], $from, $to),
        ));
    }
    ok(array('from' => $from, 'to' => $to, 'rows' => $rows));
});

/* ---------------------------- Settings ---------------------------- */

route('GET', 'admin/settings', function () {
    require_admin();
    $s = settings_all();
    unset($s['migrations']);
    $cats = all('SELECT c.id, c.name, c.is_archived, c.sort_order, (SELECT COUNT(*) FROM members m WHERE m.category_id = c.id) AS members_count FROM categories c ORDER BY c.is_archived, c.sort_order, c.name');
    ok(array('settings' => $s, 'categories' => $cats, 'mail' => array('driver' => config('MAIL_DRIVER', 'mail'), 'from' => config('MAIL_FROM', config('SMTP_USER', '')))));
});

route('POST', 'admin/settings/save', function () {
    require_admin();
    $v = new V();
    $d = array(
        'target_121s' => $v->int('target_121s', 'Monthly 121 target', true, 0, 100),
        'target_referrals' => $v->int('target_referrals', 'Monthly referrals target', true, 0, 100),
        'hero_sub' => $v->str('hero_sub', 'Hero sub-line', true, 300),
        'about' => $v->str('about', 'About paragraph', true, 2000),
        'contact_email' => $v->email('contact_email', 'Contact email', false),
        'contact_phone' => $v->str('contact_phone', 'Contact phone', false, 30),
        'contact_address' => $v->str('contact_address', 'Address', false, 300),
        'instagram_handle' => $v->str('instagram_handle', 'Instagram account', false, 120),
        'instagram_feed_url' => $v->str('instagram_feed_url', 'Instagram feed URL', false, 255),
    );
    if ($d['instagram_handle'] !== null) {
        $d['instagram_handle'] = instagram_handle_clean($d['instagram_handle']);
        if (!preg_match('/^[A-Za-z0-9._]{1,30}$/', $d['instagram_handle'])) {
            $v->error('instagram_handle', 'Enter the Instagram username, e.g. bba.official');
        }
    }
    if ($d['instagram_feed_url'] !== null && !preg_match('#^https://feeds\.behold\.so/[A-Za-z0-9_-]+/?$#', $d['instagram_feed_url'])) {
        $v->error('instagram_feed_url', 'Paste the Behold JSON feed URL, e.g. https://feeds.behold.so/AbC123');
    }
    $v->done();
    $before = settings_all();
    foreach ($d as $k => $val) {
        setting_set($k, $val === null ? '' : $val);
    }
    list($b, $a) = diff_pair($before, $d);
    if ($a) {
        audit('settings_changed', 'settings', null, $b, $a);
    }
    @unlink(PRIVATE_DIR . '/cache/public-stats.json');
    @unlink(PRIVATE_DIR . '/cache/instagram.json');
    ok(true);
});

route('POST', 'admin/categories/save', function () {
    require_admin();
    $v = new V();
    $id = $v->int('id', 'Category', false);
    $name = $v->str('name', 'Name', true, 120);
    $archived = $v->bool('is_archived');
    $v->done();
    $dupe = one('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id <> ?', array($name, $id ? $id : 0));
    if ($dupe) {
        fail('validation', 'A category with that name already exists.', 422, array('name' => 'Already exists.'));
    }
    if ($id) {
        $before = one('SELECT * FROM categories WHERE id = ?', array($id));
        update_row('categories', $id, array('name' => $name, 'is_archived' => $archived));
        audit('category_saved', 'category', $id, $before, array('name' => $name, 'is_archived' => $archived));
    } else {
        $max = (int) val('SELECT COALESCE(MAX(sort_order), 0) FROM categories');
        $id = insert('categories', array('name' => $name, 'is_archived' => 0, 'sort_order' => $max + 10));
        audit('category_created', 'category', $id, null, array('name' => $name));
    }
    ok(array('id' => $id));
});

route('POST', 'admin/email/test', function () {
    $me = require_admin();
    $ok = send_mail($me['email'], 'BBA test email', 'Email is working', array('This is a test email from the BBA Networking app. If you can read this, outgoing email is set up correctly.'));
    if (!$ok) {
        fail('mail_failed', 'Sending failed. Check the mail settings in config.secrets.php (see the server log for details).', 502);
    }
    ok(array('to' => $me['email']));
});

/* ------------------------------ Audit ----------------------------- */

route('GET', 'admin/audit', function () {
    require_admin();
    $where = array('1=1');
    $p = array();
    if (qs('action')) {
        $where[] = 'l.action = ?';
        $p[] = qs('action');
    }
    if (qs('entity')) {
        $where[] = 'l.entity = ?';
        $p[] = qs('entity');
    }
    if (qs_int('actor_id')) {
        $where[] = 'l.actor_id = ?';
        $p[] = qs_int('actor_id');
    }
    $page = max(1, qs_int('page', 1));
    $per = 40;
    $w = ' WHERE ' . implode(' AND ', $where);
    $total = (int) val('SELECT COUNT(*) FROM audit_logs l' . $w, $p);
    $rows = all('SELECT l.*, m.full_name AS actor_name FROM audit_logs l LEFT JOIN members m ON m.id = l.actor_id' . $w . ' ORDER BY l.id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $p);
    $actions = array();
    foreach (all('SELECT DISTINCT action FROM audit_logs ORDER BY action') as $a) {
        $actions[] = $a['action'];
    }
    ok(array('items' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $per, 'actions' => $actions));
});
