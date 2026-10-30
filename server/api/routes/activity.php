<?php
/**
 * Visitors, meetings & attendance, notifications (with lazy daily jobs), dashboard.
 */

/* ---------------------------- Visitors ---------------------------- */

function visitor_statuses()
{
    return array('invited', 'attended', 'joined', 'not_interested');
}

route('GET', 'visitors', function () {
    $me = require_member();
    $rows = all('SELECT v.*, mt.title AS meeting_title, mt.meeting_date FROM visitors v LEFT JOIN meetings mt ON mt.id = v.meeting_id
        WHERE v.invited_by = ? ORDER BY v.invited_date DESC, v.id DESC', array($me['id']));
    $upcoming = all('SELECT id, title, meeting_date, start_time FROM meetings WHERE meeting_date >= ? ORDER BY meeting_date LIMIT 10', array(today()));
    ok(array('items' => $rows, 'meetings' => $upcoming));
});

route('POST', 'visitors/create', function () {
    $me = require_member();
    $v = new V();
    $name = $v->str('name', 'Visitor name', true, 120);
    $mobile = $v->mobile('mobile');
    $business = $v->str('business', 'Business', false, 150);
    $category = $v->str('category', 'Category', false, 120);
    $meeting = $v->int('meeting_id', 'Meeting', false);
    $notes = $v->str('notes', 'Notes', false, 1000);
    $v->done();
    if ($meeting && !one('SELECT id FROM meetings WHERE id = ?', array($meeting))) {
        $meeting = null;
    }
    $id = insert('visitors', array(
        'invited_by' => $me['id'], 'name' => $name, 'mobile' => $mobile, 'business' => $business,
        'category' => $category, 'meeting_id' => $meeting, 'invited_date' => today(), 'status' => 'invited', 'notes' => $notes,
    ));
    q('UPDATE visitors SET code = ? WHERE id = ?', array(sprintf('BBA-V-%06d', $id), $id));
    // Already a member applicant with this mobile? Link now.
    $m = one('SELECT id, status FROM members WHERE mobile = ?', array($mobile));
    if ($m) {
        update_row('visitors', $id, array('joined_member_id' => $m['id'], 'status' => $m['status'] === 'approved' ? 'joined' : 'invited'));
    }
    ok(array('id' => $id));
});

route('POST', 'visitors/status', function () {
    $me = require_member();
    $vis = one('SELECT * FROM visitors WHERE id = ?', array((int) in_val('id')));
    if (!$vis || ((int) $vis['invited_by'] !== (int) $me['id'] && $me['role'] !== 'admin')) {
        fail('forbidden', 'Only the member who invited this visitor can update them.', 403);
    }
    $v = new V();
    $status = $v->enum('status', 'Status', visitor_statuses());
    $v->done();
    update_row('visitors', $vis['id'], array('status' => $status));
    ok(true);
});

/* ---------------------------- Meetings ---------------------------- */

route('GET', 'meetings', function () {
    $me = require_member();
    $rows = all('SELECT mt.*, a.status AS my_status FROM meetings mt LEFT JOIN attendance a ON a.meeting_id = mt.id AND a.member_id = ?
        ORDER BY mt.meeting_date DESC, mt.start_time DESC LIMIT 200', array($me['id']));
    $upcoming = array();
    $past = array();
    foreach ($rows as $r) {
        if ($r['meeting_date'] >= today()) {
            array_unshift($upcoming, $r);
        } else {
            $past[] = $r;
        }
    }
    $q = quarter_range();
    ok(array(
        'upcoming' => $upcoming,
        'past' => $past,
        'attendance_quarter' => attendance_pct($me['id'], $q[0], $q[1]),
        'attendance_all' => attendance_pct($me['id'], '2000-01-01', '2999-12-31'),
    ));
});

/* ------------------------- Notifications -------------------------- */

/** Lazy "daily jobs" — at most once per day / month per member, on request. */
function run_lazy_jobs($me)
{
    $id = (int) $me['id'];
    $flags = one('SELECT * FROM member_flags WHERE member_id = ?', array($id));
    if (!$flags) {
        q('INSERT INTO member_flags (member_id, last_followup_check, last_summary_month) VALUES (?, NULL, ?)', array($id, date('Y-m')));
        $flags = array('last_followup_check' => null, 'last_summary_month' => date('Y-m'));
    }
    if ($flags['last_followup_check'] !== today()) {
        q('UPDATE member_flags SET last_followup_check = ? WHERE member_id = ?', array(today(), $id));
        $due = all('SELECT f.due_date, r.code, r.client_name, r.requirement FROM followups f JOIN referrals r ON r.id = f.referral_id
            WHERE f.member_id = ? AND f.done = 0 AND f.due_date <= ? AND r.is_void = 0 ORDER BY f.due_date LIMIT 10', array($id, today()));
        foreach ($due as $d) {
            $title = ($d['due_date'] === today() ? 'Follow-up due today: ' : 'Overdue follow-up: ') . ($d['client_name'] ? $d['client_name'] : $d['requirement']);
            notify($id, 'followup', $title, $d['code'] . ' · ' . $d['requirement'], '/app/referrals/' . $d['code']);
        }
    }
    $month = date('Y-m');
    if ($flags['last_summary_month'] !== $month) {
        q('UPDATE member_flags SET last_summary_month = ? WHERE member_id = ?', array($month, $id));
        $r = period_range('last_month');
        $s = stats_for($id, $r[0], $r[1]);
        $target = (int) setting('target_121s', 4);
        $label = date('F', strtotime($r[0]));
        notify($id, 'summary', 'Your ' . $label . ' summary',
            $s['referrals_given'] . ' referrals given · ' . money_fmt($s['business_received']) . ' business received · ' . $s['ones_done'] . '/' . $target . ' 121s',
            '/app?period=last_month');
    }
}

route('GET', 'notifications', function () {
    $me = require_member();
    $rows = all('SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE member_id = ? ORDER BY id DESC LIMIT 60', array($me['id']));
    ok($rows);
});

route('GET', 'notifications/unread-count', function () {
    $me = require_member();
    run_lazy_jobs($me);
    $out = array('unread' => (int) val('SELECT COUNT(*) FROM notifications WHERE member_id = ? AND read_at IS NULL', array($me['id'])));
    if ($me['role'] === 'admin') {
        $out['pending_applications'] = (int) val("SELECT COUNT(*) FROM members WHERE status = 'pending_review'");
    }
    ok($out);
});

route('POST', 'notifications/read', function () {
    $me = require_member();
    $ids = in_val('ids');
    if (is_array($ids) && $ids) {
        $ids = array_map('intval', $ids);
        $params = array_merge(array(now(), $me['id']), $ids);
        q('UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL AND id IN (' . in_placeholders($ids) . ')', $params);
    } else {
        q('UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL', array(now(), $me['id']));
    }
    ok(true);
});

/* ---------------------------- Dashboard --------------------------- */

route('GET', 'dashboard', function () {
    $me = require_member();
    $id = (int) $me['id'];
    run_lazy_jobs($me);
    $period = qs('period', 'this_month');
    $r = range_with_prev();
    $cur = stats_for($id, $r[0], $r[1]);
    $prev = $r[2] ? stats_for($id, $r[2], $r[3]) : null;

    // Needs your attention
    $attention = array();
    $now = now();
    foreach (all(ones_select() . " WHERE o.status = 'awaiting_confirmation' AND o.logged_by <> ? AND (o.requester_id = ? OR o.partner_id = ?) ORDER BY o.meeting_at DESC LIMIT 10", array($id, $id, $id)) as $o) {
        $s = one_shape($o, $id);
        $attention[] = array('kind' => '121_confirm', 'id' => $s['id'], 'title' => 'Did you meet ' . $s['other']['full_name'] . '?', 'sub' => date('j M, g:i A', strtotime($s['meeting_at'])), 'link' => '/app/121s?open=' . $s['id']);
    }
    foreach (all(ones_select() . " WHERE o.status = 'requested' AND COALESCE(o.proposed_by, o.requester_id) <> ? AND (o.requester_id = ? OR o.partner_id = ?) ORDER BY o.meeting_at LIMIT 10", array($id, $id, $id)) as $o) {
        $s = one_shape($o, $id);
        $attention[] = array('kind' => '121_request', 'id' => $s['id'], 'title' => $s['other']['full_name'] . ' wants a 121', 'sub' => date('j M, g:i A', strtotime($s['meeting_at'])), 'link' => '/app/121s?open=' . $s['id']);
    }
    foreach (all(ones_select() . " WHERE o.status = 'scheduled' AND o.meeting_at < ? AND (o.requester_id = ? OR o.partner_id = ?) ORDER BY o.meeting_at DESC LIMIT 10", array($now, $id, $id)) as $o) {
        $s = one_shape($o, $id);
        $attention[] = array('kind' => '121_mark', 'id' => $s['id'], 'title' => 'Mark your 121 with ' . $s['other']['full_name'] . ' as done', 'sub' => date('j M, g:i A', strtotime($s['meeting_at'])), 'link' => '/app/121s?open=' . $s['id']);
    }
    foreach (all(referral_select() . " WHERE r.receiver_id = ? AND r.status = 'new' AND r.type = 'referral' AND r.is_void = 0 ORDER BY r.id DESC LIMIT 10", array($id)) as $ref) {
        $attention[] = array('kind' => 'referral_new', 'id' => (int) $ref['id'], 'title' => 'New referral from ' . $ref['giver_name'], 'sub' => $ref['client_name'] . ' · ' . $ref['requirement'], 'link' => '/app/referrals/' . $ref['code']);
    }
    foreach (all('SELECT f.due_date, r.code, r.client_name, r.requirement FROM followups f JOIN referrals r ON r.id = f.referral_id
        WHERE f.member_id = ? AND f.done = 0 AND f.due_date <= ? AND r.is_void = 0 ORDER BY f.due_date LIMIT 10', array($id, today())) as $f) {
        $attention[] = array('kind' => 'followup', 'title' => ($f['due_date'] === today() ? 'Follow up today: ' : 'Overdue follow-up: ') . ($f['client_name'] ? $f['client_name'] : $f['requirement']), 'sub' => $f['code'] . ' · due ' . date('j M', strtotime($f['due_date'])), 'link' => '/app/referrals/' . $f['code']);
    }
    foreach (all(referral_select() . ' WHERE r.created_by = ? AND r.is_disputed = 1 AND r.is_void = 0 ORDER BY r.id DESC LIMIT 5', array($id)) as $ref) {
        $attention[] = array('kind' => 'disputed', 'title' => $ref['code'] . ' was disputed', 'sub' => (string) $ref['dispute_reason'], 'link' => '/app/referrals/' . $ref['code']);
    }

    // Trend chart over the selected range
    $cb = chart_buckets($r[0], $r[1], val('SELECT MIN(referral_date) FROM referrals WHERE giver_id = ? OR receiver_id = ?', array($id, $id)));
    $series = array();
    foreach ($cb['buckets'] as $k => $label) {
        $series[$k] = array('label' => $label, 'given' => 0, 'received' => 0, 'biz_received' => 0, 'biz_given' => 0);
    }
    foreach (all("SELECT referral_date AS d, SUM(CASE WHEN giver_id = ? THEN 1 ELSE 0 END) AS g, SUM(CASE WHEN receiver_id = ? THEN 1 ELSE 0 END) AS rcv
        FROM referrals WHERE type = 'referral' AND " . LIVE_REF . ' AND (giver_id = ? OR receiver_id = ?) AND referral_date BETWEEN ? AND ? GROUP BY referral_date', array($id, $id, $id, $id, $r[0], $r[1])) as $row) {
        $k = bucket_key($row['d'], $cb['grain']);
        if (isset($series[$k])) {
            $series[$k]['given'] += (int) $row['g'];
            $series[$k]['received'] += (int) $row['rcv'];
        }
    }
    foreach (all("SELECT won_date AS d, SUM(CASE WHEN receiver_id = ? THEN final_value ELSE 0 END) AS br, SUM(CASE WHEN giver_id = ? THEN final_value ELSE 0 END) AS bg
        FROM referrals WHERE status = 'won' AND " . LIVE_REF . ' AND (giver_id = ? OR receiver_id = ?) AND won_date BETWEEN ? AND ? GROUP BY won_date', array($id, $id, $id, $id, $r[0], $r[1])) as $row) {
        $k = bucket_key($row['d'], $cb['grain']);
        if (isset($series[$k])) {
            $series[$k]['biz_received'] += (float) $row['br'];
            $series[$k]['biz_given'] += (float) $row['bg'];
        }
    }

    // Recent activity — records involving me, newest first
    $activity = array();
    foreach (all(referral_select() . ' WHERE (r.giver_id = ? OR r.receiver_id = ?) ORDER BY r.updated_at DESC LIMIT 10', array($id, $id)) as $ref) {
        $given = (int) $ref['giver_id'] === $id;
        $other = $given ? $ref['receiver_name'] : $ref['giver_name'];
        if ($ref['status'] === 'won') {
            $text = $given ? first_name($other) . ' closed ' . money_fmt($ref['final_value']) . ' from your referral' : 'You closed ' . money_fmt($ref['final_value']) . ' from ' . first_name($other);
            if ($ref['type'] === 'direct') {
                $text = $given ? first_name($other) . ' thanked you for ' . money_fmt($ref['final_value']) : 'You thanked ' . first_name($other) . ' for ' . money_fmt($ref['final_value']);
            }
        } else {
            $text = $given ? 'You gave ' . first_name($other) . ' a referral: ' . $ref['requirement'] : first_name($other) . ' gave you a referral: ' . $ref['requirement'];
        }
        $activity[] = array('at' => $ref['updated_at'], 'text' => $text, 'kind' => $ref['status'] === 'won' ? 'won' : 'referral', 'link' => '/app/referrals/' . $ref['code'], 'photo_url' => photo_url($given ? $ref['receiver_photo'] : $ref['giver_photo']), 'name' => $other);
    }
    foreach (all(ones_select() . ' WHERE (o.requester_id = ? OR o.partner_id = ?) ORDER BY o.updated_at DESC LIMIT 10', array($id, $id)) as $o) {
        $s = one_shape($o, $id);
        $map = array('requested' => '121 requested with ', 'scheduled' => '121 scheduled with ', 'awaiting_confirmation' => '121 awaiting confirmation with ', 'completed' => '121 with ', 'declined' => '121 declined with ', 'cancelled' => '121 cancelled with ');
        $text = $map[$s['status']] . first_name($s['other']['full_name']) . ($s['status'] === 'completed' ? ' confirmed' : '');
        $activity[] = array('at' => $o['updated_at'], 'text' => $text, 'kind' => '121', 'link' => '/app/121s?open=' . $s['id'], 'photo_url' => $s['other']['photo_url'], 'name' => $s['other']['full_name']);
    }
    usort($activity, function ($a, $b) {
        return strcmp($b['at'], $a['at']);
    });
    $activity = array_slice($activity, 0, 10);

    // Top contributors in the selected range (business given)
    $top = all("SELECT m.id, m.full_name, m.business_name, m.photo_path, SUM(r.final_value) AS total FROM referrals r JOIN members m ON m.id = r.giver_id
        WHERE r.status = 'won' AND r.is_void = 0 AND r.is_disputed = 0 AND r.won_date BETWEEN ? AND ? AND m.status = 'approved' AND m.role = 'member'
        GROUP BY m.id, m.full_name, m.business_name, m.photo_path ORDER BY total DESC LIMIT 5", array($r[0], $r[1]));
    foreach ($top as $i => $t) {
        $top[$i]['photo_url'] = photo_url($t['photo_path']);
        unset($top[$i]['photo_path']);
    }

    $tcount = (int) val('SELECT COUNT(*) FROM testimonials WHERE subject_id = ?', array($id));
    $tlatest = one('SELECT t.body, a.full_name AS author_name FROM testimonials t JOIN members a ON a.id = t.author_id WHERE t.subject_id = ? ORDER BY t.updated_at DESC LIMIT 1', array($id));
    $q = quarter_range();

    // 121s this month (for the progress ring, independent of the period picker)
    $monthOnes = stats_for($id, date('Y-m-01'), date('Y-m-t'));
    $next = one('SELECT mt.id, mt.title, mt.meeting_date, mt.start_time, mt.venue, mt.online_link, a.status AS my_status FROM meetings mt
        LEFT JOIN attendance a ON a.meeting_id = mt.id AND a.member_id = ? WHERE mt.meeting_date >= ? ORDER BY mt.meeting_date, mt.start_time LIMIT 1', array($id, today()));

    ok(array(
        'period' => $period,
        'from' => $r[0],
        'to' => $r[1],
        'label' => $r[4],
        'cards' => $cur,
        'prev' => $prev,
        'month_ones' => $monthOnes['ones_done'],
        'targets' => array('ones' => (int) setting('target_121s', 4), 'referrals' => (int) setting('target_referrals', 2)),
        'attention' => $attention,
        'chart' => array_values($series),
        'chart_grain' => $cb['grain'],
        'next_meeting' => $next,
        'activity' => $activity,
        'top' => $top,
        'testimonials' => array('count' => $tcount, 'latest' => $tlatest),
        'attendance_quarter' => attendance_pct($id, $q[0], $q[1]),
    ));
});
