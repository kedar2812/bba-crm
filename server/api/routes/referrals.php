<?php

function referral_statuses()
{
    return array('new', 'contacted', 'in_progress', 'won', 'lost');
}

function referral_select()
{
    return 'SELECT r.*, g.full_name AS giver_name, g.business_name AS giver_business, g.photo_path AS giver_photo,
        rc.full_name AS receiver_name, rc.business_name AS receiver_business, rc.photo_path AS receiver_photo
        FROM referrals r JOIN members g ON g.id = r.giver_id JOIN members rc ON rc.id = r.receiver_id';
}

function referral_shape($r, $meId = null)
{
    $out = array(
        'id' => (int) $r['id'],
        'code' => $r['code'],
        'type' => $r['type'],
        'status' => $r['status'],
        'client_name' => $r['client_name'],
        'client_phone' => $r['client_phone'],
        'client_email' => $r['client_email'],
        'requirement' => $r['requirement'],
        'description' => $r['description'],
        'estimated_value' => $r['estimated_value'] === null ? null : (float) $r['estimated_value'],
        'final_value' => $r['final_value'] === null ? null : (float) $r['final_value'],
        'referral_date' => $r['referral_date'],
        'won_date' => $r['won_date'],
        'thank_you_note' => $r['thank_you_note'],
        'lost_reason' => $r['lost_reason'],
        'has_proof' => (bool) $r['proof_path'],
        'is_disputed' => (bool) $r['is_disputed'],
        'dispute_reason' => $r['dispute_reason'],
        'is_void' => (bool) $r['is_void'],
        'created_by' => (int) $r['created_by'],
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
        'giver' => array('id' => (int) $r['giver_id'], 'full_name' => $r['giver_name'], 'business_name' => $r['giver_business'], 'photo_url' => photo_url($r['giver_photo'])),
        'receiver' => array('id' => (int) $r['receiver_id'], 'full_name' => $r['receiver_name'], 'business_name' => $r['receiver_business'], 'photo_url' => photo_url($r['receiver_photo'])),
    );
    if ($meId) {
        $out['direction'] = (int) $r['giver_id'] === (int) $meId ? 'given' : 'received';
    }
    return $out;
}

/** Load a referral the current member is party to (admins see all). */
function referral_for_me($idOrCode)
{
    $me = require_member();
    $col = is_numeric($idOrCode) ? 'r.id' : 'r.code';
    $r = one(referral_select() . ' WHERE ' . $col . ' = ?', array($idOrCode));
    if (!$r) {
        fail('not_found', 'That record does not exist.', 404);
    }
    $party = (int) $r['giver_id'] === (int) $me['id'] || (int) $r['receiver_id'] === (int) $me['id'];
    if (!$party && $me['role'] !== 'admin') {
        fail('forbidden', 'You do not have access to this record.', 403);
    }
    return $r;
}

function referral_event($refId, $kind, $body = null, $from = null, $to = null)
{
    insert('referral_events', array(
        'referral_id' => $refId,
        'member_id' => me_id(),
        'kind' => $kind,
        'from_status' => $from,
        'to_status' => $to,
        'body' => $body,
    ));
}

function status_label($s)
{
    $map = array('new' => 'New', 'contacted' => 'Contacted', 'in_progress' => 'In Progress', 'won' => 'Won', 'lost' => 'Lost');
    return isset($map[$s]) ? $map[$s] : $s;
}

route('GET', 'referrals', function () {
    $me = require_member();
    $id = (int) $me['id'];
    $box = qs('box', 'given');
    $where = array();
    $params = array();
    if ($box === 'received') {
        $where[] = "r.receiver_id = ? AND r.type = 'referral'";
        $params[] = $id;
    } elseif ($box === 'closed') {
        // side=received: business I received · side=given: business I generated for others.
        $side = qs('side');
        if ($side === 'received') {
            $where[] = "r.receiver_id = ? AND r.status = 'won'";
            $params[] = $id;
        } elseif ($side === 'given') {
            $where[] = "r.giver_id = ? AND r.status = 'won'";
            $params[] = $id;
        } else {
            $where[] = "(r.giver_id = ? OR r.receiver_id = ?) AND r.status = 'won'";
            $params[] = $id;
            $params[] = $id;
        }
        if (qs('period')) {
            $range = range_with_prev();
            $where[] = 'r.won_date BETWEEN ? AND ?';
            $params[] = $range[0];
            $params[] = $range[1];
        }
    } else {
        $where[] = "r.giver_id = ? AND r.type = 'referral'";
        $params[] = $id;
    }
    $status = qs('status');
    if ($status && in_array($status, referral_statuses(), true)) {
        $where[] = 'r.status = ?';
        $params[] = $status;
    }
    $search = qs('q');
    if ($search) {
        $like = '%' . $search . '%';
        $where[] = '(r.client_name LIKE ? OR r.requirement LIKE ? OR r.code LIKE ? OR g.full_name LIKE ? OR rc.full_name LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like);
    }
    $page = max(1, qs_int('page', 1));
    $per = 20;
    $w = ' WHERE ' . implode(' AND ', $where);
    $total = (int) val('SELECT COUNT(*) FROM referrals r JOIN members g ON g.id = r.giver_id JOIN members rc ON rc.id = r.receiver_id' . $w, $params);
    $order = $box === 'closed' ? 'r.won_date DESC, r.id DESC' : 'r.referral_date DESC, r.id DESC';
    $rows = all(referral_select() . $w . ' ORDER BY ' . $order . ' LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $params);
    $items = array();
    foreach ($rows as $r) {
        $items[] = referral_shape($r, $id);
    }
    $out = array('items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $per);
    if ($box === 'closed') {
        // Same rules as the dashboard cards, so the two always agree.
        $inRange = '';
        $rp = array();
        if (isset($range)) {
            $inRange = ' AND won_date BETWEEN ? AND ?';
            $rp = array($range[0], $range[1]);
            $out['from'] = $range[0];
            $out['to'] = $range[1];
            $out['label'] = $range[4];
        }
        $out['totals'] = array(
            'received' => (float) val("SELECT COALESCE(SUM(final_value),0) FROM referrals WHERE status='won' AND receiver_id = ? AND " . LIVE_REF . $inRange, array_merge(array($id), $rp)),
            'given' => (float) val("SELECT COALESCE(SUM(final_value),0) FROM referrals WHERE status='won' AND giver_id = ? AND " . LIVE_REF . $inRange, array_merge(array($id), $rp)),
        );
    }
    ok($out);
});

route('GET', 'referrals/view', function () {
    $me = require_member();
    $r = referral_for_me(qs('code', qs('id', '')));
    $events = all('SELECT e.*, m.full_name AS member_name FROM referral_events e JOIN members m ON m.id = e.member_id WHERE e.referral_id = ? ORDER BY e.id ASC', array($r['id']));
    $f = one('SELECT due_date, done FROM followups WHERE referral_id = ? AND member_id = ?', array($r['id'], $me['id']));
    $out = referral_shape($r, $me['id']);
    $out['events'] = $events;
    $out['my_followup'] = $f && !(int) $f['done'] ? $f['due_date'] : null;
    $isGiver = (int) $r['giver_id'] === (int) $me['id'];
    $isReceiver = (int) $r['receiver_id'] === (int) $me['id'];
    $isCreator = (int) $r['created_by'] === (int) $me['id'];
    $out['can'] = array(
        'status' => $isReceiver && $r['type'] === 'referral' && !$r['is_void'],
        'edit' => $isCreator && !$r['is_void'] && ($r['type'] === 'direct' || $r['status'] === 'new'),
        'dispute' => ($isGiver || $isReceiver) && !$isCreator && !$r['is_disputed'] && !$r['is_void'],
        'note' => $isGiver || $isReceiver,
        'proof' => $isReceiver && $r['status'] === 'won' && !$r['is_void'],
    );
    ok($out);
});

route('POST', 'referrals/create', function () {
    $me = require_member();
    $v = new V();
    $to = $v->int('receiver_id', 'To member');
    $client = $v->str('client_name', 'Client / business name', true, 150);
    $req = $v->str('requirement', 'What they need', true, 255);
    $est = $v->money('estimated_value', 'Estimated value', false);
    $phone = $v->str('client_phone', 'Client phone', false, 20);
    $email = $v->email('client_email', 'Client email', false);
    $desc = $v->str('description', 'Description', false, 2000);
    $date = $v->date('referral_date', 'Referral date', false);
    $follow = $v->date('followup_date', 'Follow-up date', false);
    $note = $v->str('notes', 'Notes', false, 2000);
    $v->done();
    $rcv = approved_member_or_fail($to, 'receiver_id', $me['id'], 'You cannot give a referral to yourself.');
    $date = $date ? $date : today();
    if ($date > today()) {
        fail('validation', 'Referral date cannot be in the future.', 422, array('referral_date' => 'Cannot be in the future.'));
    }

    $id = insert('referrals', array(
        'type' => 'referral',
        'giver_id' => $me['id'],
        'receiver_id' => $rcv['id'],
        'created_by' => $me['id'],
        'client_name' => $client,
        'client_phone' => $phone,
        'client_email' => $email,
        'requirement' => $req,
        'description' => $desc,
        'estimated_value' => $est,
        'referral_date' => $date,
        'status' => 'new',
    ));
    $code = sprintf('BBA-R-%06d', $id);
    q('UPDATE referrals SET code = ? WHERE id = ?', array($code, $id));
    referral_event($id, 'created');
    if ($note) {
        referral_event($id, 'note', $note);
    }
    if ($follow) {
        insert('followups', array('referral_id' => $id, 'member_id' => $me['id'], 'due_date' => $follow));
    }
    notify($rcv['id'], 'referral_new', first_name($me['full_name']) . ' gave you a referral: ' . $req, $client . ($est ? ' · est. ' . money_fmt($est) : ''), '/app/referrals/' . $code);
    ok(array('code' => $code, 'receiver_name' => $rcv['full_name']));
});

route('POST', 'referrals/direct', function () {
    $me = require_member();
    $v = new V();
    $from = $v->int('giver_id', 'From member');
    $value = $v->money('value', 'Value');
    $req = $v->str('requirement', 'What it was for', true, 255);
    $date = $v->date('won_date', 'Date', false);
    $msg = $v->str('thank_you_note', 'Message', false, 2000);
    $client = $v->str('client_name', 'Client', false, 150);
    $v->done();
    if ($value !== null && $value <= 0) {
        fail('validation', 'Enter the business value.', 422, array('value' => 'Enter the business value.'));
    }
    $giver = approved_member_or_fail($from, 'giver_id', $me['id'], 'You cannot thank yourself.');
    $date = $date ? $date : today();
    if ($date > today()) {
        fail('validation', 'Date cannot be in the future.', 422, array('won_date' => 'Cannot be in the future.'));
    }
    $id = insert('referrals', array(
        'type' => 'direct',
        'giver_id' => $giver['id'],
        'receiver_id' => $me['id'],
        'created_by' => $me['id'],
        'client_name' => $client ? $client : '',
        'requirement' => $req,
        'estimated_value' => $value,
        'referral_date' => $date,
        'status' => 'won',
        'final_value' => $value,
        'won_date' => $date,
        'thank_you_note' => $msg,
    ));
    $code = sprintf('BBA-R-%06d', $id);
    q('UPDATE referrals SET code = ? WHERE id = ?', array($code, $id));
    referral_event($id, 'created', $msg);
    notify($giver['id'], 'referral_won', first_name($me['full_name']) . ' thanked you for ' . money_fmt($value) . ' of business', $req, '/app/referrals/' . $code);
    ok(array('code' => $code, 'id' => $id, 'giver_name' => $giver['full_name']));
});

route('POST', 'referrals/update', function () {
    $me = require_member();
    $r = referral_for_me(in_val('code', ''));
    if ((int) $r['created_by'] !== (int) $me['id'] || $r['is_void'] || ($r['type'] === 'referral' && $r['status'] !== 'new')) {
        fail('forbidden', 'You can only edit your own records while they are New.', 403);
    }
    $v = new V();
    $data = array(
        'client_name' => $v->str('client_name', 'Client name', $r['type'] === 'referral', 150),
        'client_phone' => $v->str('client_phone', 'Client phone', false, 20),
        'client_email' => $v->email('client_email', 'Client email', false),
        'requirement' => $v->str('requirement', 'Requirement', true, 255),
        'description' => $v->str('description', 'Description', false, 2000),
    );
    if ($r['type'] === 'referral') {
        $data['estimated_value'] = $v->money('estimated_value', 'Estimated value', false);
    } else {
        $val = $v->money('final_value', 'Value');
        $data['final_value'] = $val;
        $data['estimated_value'] = $val;
        $data['thank_you_note'] = $v->str('thank_you_note', 'Message', false, 2000);
    }
    $v->done();
    if ($data['client_name'] === null) {
        $data['client_name'] = '';
    }
    update_row('referrals', $r['id'], $data);
    referral_event($r['id'], 'edit', 'Details updated');
    ok(true);
});

route('POST', 'referrals/status', function () {
    $me = require_member();
    $r = referral_for_me(in_val('code', ''));
    if ((int) $r['receiver_id'] !== (int) $me['id'] || $r['type'] !== 'referral' || $r['is_void']) {
        fail('forbidden', 'Only the member who received this referral can change its status.', 403);
    }
    $v = new V();
    $status = $v->enum('status', 'Status', referral_statuses());
    $data = array('status' => $status);
    if ($status === 'won') {
        $data['final_value'] = $v->money('final_value', 'Final business value');
        $data['won_date'] = $v->date('won_date', 'Conversion date', false);
        $data['thank_you_note'] = $v->str('thank_you_note', 'Thank-you note', false, 2000);
        if ($data['final_value'] !== null && $data['final_value'] <= 0) {
            $v->error('final_value', 'Enter the final business value.');
        }
        if (!$data['won_date']) {
            $data['won_date'] = today();
        }
        $data['lost_reason'] = null;
    } elseif ($status === 'lost') {
        $data['lost_reason'] = $v->str('lost_reason', 'Reason', false, 255);
        $data['final_value'] = null;
        $data['won_date'] = null;
    } else {
        $data['final_value'] = null;
        $data['won_date'] = null;
    }
    $v->done();
    if ($status === $r['status'] && $status !== 'won') {
        ok(true);
    }
    update_row('referrals', $r['id'], $data);
    $body = null;
    if ($status === 'won') {
        $body = money_fmt($data['final_value']) . ($data['thank_you_note'] ? ' — ' . $data['thank_you_note'] : '');
    } elseif ($status === 'lost' && $data['lost_reason']) {
        $body = $data['lost_reason'];
    }
    referral_event($r['id'], 'status', $body, $r['status'], $status);
    $link = '/app/referrals/' . $r['code'];
    if ($status === 'won') {
        notify($r['giver_id'], 'referral_won', first_name($me['full_name']) . ' thanked you for ' . money_fmt($data['final_value']) . ' of business', $r['requirement'] . ($data['thank_you_note'] ? ' — "' . $data['thank_you_note'] . '"' : ''), $link);
    } else {
        notify($r['giver_id'], 'referral_status', 'Your referral to ' . first_name($me['full_name']) . ' is now ' . status_label($status), $r['client_name'] . ' · ' . $r['requirement'], $link);
    }
    ok(true);
});

route('POST', 'referrals/note', function () {
    $me = require_member();
    $r = referral_for_me(in_val('code', ''));
    $isParty = (int) $r['giver_id'] === (int) $me['id'] || (int) $r['receiver_id'] === (int) $me['id'];
    if (!$isParty) {
        fail('forbidden', 'Only the two members on this record can add notes.', 403);
    }
    $v = new V();
    $body = $v->str('body', 'Note', true, 2000);
    $v->done();
    referral_event($r['id'], 'note', $body);
    $other = (int) $r['giver_id'] === (int) $me['id'] ? $r['receiver_id'] : $r['giver_id'];
    notify($other, 'referral_note', first_name($me['full_name']) . ' added a note on ' . $r['code'], mb_substr($body, 0, 140), '/app/referrals/' . $r['code']);
    ok(true);
});

route('POST', 'referrals/followup', function () {
    $me = require_member();
    $r = referral_for_me(in_val('code', ''));
    $v = new V();
    $date = $v->date('due_date', 'Follow-up date', false);
    $v->done();
    q('DELETE FROM followups WHERE referral_id = ? AND member_id = ?', array($r['id'], $me['id']));
    if ($date) {
        insert('followups', array('referral_id' => $r['id'], 'member_id' => $me['id'], 'due_date' => $date));
    }
    ok(true);
});

route('POST', 'referrals/dispute', function () {
    $me = require_member();
    $r = referral_for_me(in_val('code', ''));
    $isParty = (int) $r['giver_id'] === (int) $me['id'] || (int) $r['receiver_id'] === (int) $me['id'];
    if (!$isParty || (int) $r['created_by'] === (int) $me['id']) {
        fail('forbidden', 'Only the other member on this record can dispute it.', 403);
    }
    if ($r['is_disputed']) {
        fail('conflict', 'This record is already disputed.', 409);
    }
    $v = new V();
    $reason = $v->str('reason', 'Reason', true, 255);
    $v->done();
    update_row('referrals', $r['id'], array('is_disputed' => 1, 'dispute_reason' => $reason, 'disputed_by' => $me['id']));
    referral_event($r['id'], 'dispute', $reason);
    audit('dispute_raised', 'referral', (int) $r['id'], null, array('reason' => $reason));
    notify($r['created_by'], 'disputed', first_name($me['full_name']) . ' disputed ' . $r['code'], $reason, '/app/referrals/' . $r['code']);
    notify_admins('disputed', 'Record disputed: ' . $r['code'], $me['full_name'] . ': ' . $reason, '/admin/records?type=referrals&disputed=1');
    ok(true);
});

route('POST', 'referrals/proof', function () {
    $me = require_member();
    $r = referral_for_me(isset($_POST['code']) ? $_POST['code'] : '');
    if ((int) $r['receiver_id'] !== (int) $me['id'] && $me['role'] !== 'admin') {
        fail('forbidden', 'Only the member who received the business can upload proof.', 403);
    }
    $name = save_proof('file');
    if (!$name) {
        fail('validation', 'Choose a file to upload.', 422, array('file' => 'Choose a file.'));
    }
    if ($r['proof_path']) {
        @unlink(PRIVATE_DIR . '/uploads/proofs/' . basename($r['proof_path']));
    }
    update_row('referrals', $r['id'], array('proof_path' => $name));
    ok(true);
});

route('GET', 'files/proof', function () {
    $r = referral_for_me(qs('code', qs('id', '')));
    if (!$r['proof_path']) {
        fail('not_found', 'No proof uploaded.', 404);
    }
    $file = PRIVATE_DIR . '/uploads/proofs/' . basename($r['proof_path']);
    if (!is_file($file)) {
        fail('not_found', 'File missing.', 404);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    header('Content-Type: ' . $finfo->file($file));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="proof-' . $r['code'] . '.' . pathinfo($file, PATHINFO_EXTENSION) . '"');
    header('Cache-Control: private, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
});
