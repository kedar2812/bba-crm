<?php
/**
 * 121 meetings. States: requested → scheduled → awaiting_confirmation → completed
 * (or declined / cancelled). A scheduled 121 whose time has passed is shown as
 * awaiting confirmation (computed on read — no cron). Only completed 121s count.
 */

function ones_select()
{
    return 'SELECT o.*, a.full_name AS requester_name, a.business_name AS requester_business, a.photo_path AS requester_photo,
        b.full_name AS partner_name, b.business_name AS partner_business, b.photo_path AS partner_photo
        FROM one_to_ones o JOIN members a ON a.id = o.requester_id JOIN members b ON b.id = o.partner_id';
}

function one_shape($o, $meId)
{
    $iAmRequester = (int) $o['requester_id'] === (int) $meId;
    $past = strtotime($o['meeting_at']) <= time();
    $effective = $o['status'];
    if ($o['status'] === 'scheduled' && $past) {
        $effective = 'awaiting_confirmation';
    }
    $otherId = $iAmRequester ? $o['partner_id'] : $o['requester_id'];
    $other = array(
        'id' => (int) $otherId,
        'full_name' => $iAmRequester ? $o['partner_name'] : $o['requester_name'],
        'business_name' => $iAmRequester ? $o['partner_business'] : $o['requester_business'],
        'photo_url' => photo_url($iAmRequester ? $o['partner_photo'] : $o['requester_photo']),
    );
    $proposedBy = $o['proposed_by'] ? (int) $o['proposed_by'] : (int) $o['requester_id'];
    $loggedBy = $o['logged_by'] ? (int) $o['logged_by'] : null;
    $isParty = (int) $o['requester_id'] === (int) $meId || (int) $o['partner_id'] === (int) $meId;
    return array(
        'id' => (int) $o['id'],
        'code' => $o['code'],
        'meeting_at' => $o['meeting_at'],
        'mode' => $o['mode'],
        'status' => $o['status'],
        'effective_status' => $effective,
        'other' => $other,
        'requester' => array('id' => (int) $o['requester_id'], 'full_name' => $o['requester_name']),
        'partner' => array('id' => (int) $o['partner_id'], 'full_name' => $o['partner_name']),
        'i_am_requester' => $iAmRequester,
        'request_message' => $o['request_message'],
        'business_discussed' => $o['business_discussed'],
        'products_introduced' => $o['products_introduced'],
        'referrals_exchanged' => $o['referrals_exchanged'],
        'follow_up_actions' => $o['follow_up_actions'],
        'my_notes' => $iAmRequester ? $o['requester_notes'] : $o['partner_notes'],
        'their_notes' => $iAmRequester ? $o['partner_notes'] : $o['requester_notes'],
        'requester_notes' => $o['requester_notes'],
        'partner_notes' => $o['partner_notes'],
        'logged_by' => $loggedBy,
        'confirmed_at' => $o['confirmed_at'],
        'force_confirmed' => (bool) $o['force_confirmed_by'],
        'can' => array(
            'respond' => $isParty && $o['status'] === 'requested' && $proposedBy !== (int) $meId,
            'cancel' => $isParty && in_array($o['status'], array('requested', 'scheduled'), true) && !($o['status'] === 'scheduled' && $past),
            'mark_done' => $isParty && $o['status'] === 'scheduled' && $past,
            'confirm' => $isParty && $o['status'] === 'awaiting_confirmation' && $loggedBy !== (int) $meId,
        ),
        'waiting_on_other' => ($o['status'] === 'requested' && $proposedBy === (int) $meId)
            || ($o['status'] === 'awaiting_confirmation' && $loggedBy === (int) $meId),
    );
}

function one_for_me($id)
{
    $me = require_member();
    $o = one(ones_select() . ' WHERE o.id = ?', array((int) $id));
    if (!$o) {
        fail('not_found', 'That meeting does not exist.', 404);
    }
    if ((int) $o['requester_id'] !== (int) $me['id'] && (int) $o['partner_id'] !== (int) $me['id']) {
        fail('forbidden', 'You do not have access to this meeting.', 403);
    }
    return $o;
}

function one_other_id($o, $meId)
{
    return (int) $o['requester_id'] === (int) $meId ? (int) $o['partner_id'] : (int) $o['requester_id'];
}

function one_details_from($v)
{
    return array(
        'business_discussed' => $v->str('business_discussed', 'Business discussed', false, 2000),
        'products_introduced' => $v->str('products_introduced', 'Products introduced', false, 2000),
        'referrals_exchanged' => $v->str('referrals_exchanged', 'Referrals exchanged', false, 2000),
        'follow_up_actions' => $v->str('follow_up_actions', 'Follow-up actions', false, 2000),
    );
}

define('ONE_PHOTOS_MAX', 10);

/** Photos for a set of 121s, grouped by 121 id, oldest first. */
function one_photos_for($oneIds, $meId)
{
    $out = array();
    if (!$oneIds) {
        return $out;
    }
    $rows = all('SELECT id, one_id, uploaded_by, created_at FROM one_photos WHERE one_id IN (' . implode(',', array_fill(0, count($oneIds), '?')) . ') ORDER BY id', array_values($oneIds));
    foreach ($rows as $p) {
        $out[(int) $p['one_id']][] = array(
            'id' => (int) $p['id'],
            'mine' => (int) $p['uploaded_by'] === (int) $meId,
            'created_at' => $p['created_at'],
        );
    }
    return $out;
}

/** A photo row the current member may see: they are in the 121, or an admin. */
function one_photo_for_me($photoId)
{
    $me = require_member();
    $p = one('SELECT p.*, o.requester_id, o.partner_id, o.code FROM one_photos p JOIN one_to_ones o ON o.id = p.one_id WHERE p.id = ?', array((int) $photoId));
    if (!$p) {
        fail('not_found', 'That photo does not exist.', 404);
    }
    $isParty = (int) $p['requester_id'] === (int) $me['id'] || (int) $p['partner_id'] === (int) $me['id'];
    if (!$isParty && $me['role'] !== 'admin') {
        fail('forbidden', 'You do not have access to this photo.', 403);
    }
    return array($p, $me);
}

function when_text($dt)
{
    return date('j M, g:i A', strtotime($dt));
}

route('GET', '121s', function () {
    $me = require_member();
    $id = (int) $me['id'];
    $rows = all(ones_select() . ' WHERE (o.requester_id = ? OR o.partner_id = ?) ORDER BY o.meeting_at DESC LIMIT 300', array($id, $id));
    $photos = one_photos_for(array_map(function ($r) {
        return (int) $r['id'];
    }, $rows), $id);
    $items = array();
    foreach ($rows as $r) {
        $s = one_shape($r, $id);
        $s['photos'] = isset($photos[$s['id']]) ? $photos[$s['id']] : array();
        $items[] = $s;
    }
    $from = date('Y-m-01');
    $to = date('Y-m-t');
    $done = (int) val("SELECT COUNT(*) FROM one_to_ones WHERE status = 'completed' AND (requester_id = ? OR partner_id = ?) AND meeting_at BETWEEN ? AND ?", array($id, $id, $from . ' 00:00:00', $to . ' 23:59:59'));
    ok(array('items' => $items, 'month_done' => $done, 'target' => (int) setting('target_121s', 4)));
});

route('POST', '121s/request', function () {
    $me = require_member();
    $v = new V();
    $partnerId = $v->int('partner_id', 'Member');
    $at = $v->datetime('meeting_at', 'Date & time');
    $mode = $v->enum('mode', 'Mode', array('in_person', 'online'), false, 'in_person');
    $msg = $v->str('request_message', 'Message', false, 1000);
    $v->done();
    $p = approved_member_or_fail($partnerId, 'partner_id', $me['id'], 'You cannot meet yourself.');
    if (strtotime($at) < time() - 300) {
        fail('validation', 'Pick a future time — use "Log a 121" for a meeting that already happened.', 422, array('meeting_at' => 'Pick a future time.'));
    }
    $id = insert('one_to_ones', array(
        'requester_id' => $me['id'], 'partner_id' => $p['id'], 'meeting_at' => $at, 'mode' => $mode,
        'status' => 'requested', 'proposed_by' => $me['id'], 'request_message' => $msg,
    ));
    q('UPDATE one_to_ones SET code = ? WHERE id = ?', array(sprintf('BBA-M-%06d', $id), $id));
    notify($p['id'], '121_request', first_name($me['full_name']) . ' wants a 121 with you', when_text($at) . ($msg ? ' — ' . $msg : ''), '/app/121s?open=' . $id);
    ok(array('id' => $id, 'partner_name' => $p['full_name']));
});

route('POST', '121s/respond', function () {
    $me = require_member();
    $o = one_for_me(in_val('id'));
    $s = one_shape($o, $me['id']);
    if (!$s['can']['respond']) {
        fail('forbidden', 'This request is not waiting on you.', 403);
    }
    $v = new V();
    $action = $v->enum('action', 'Action', array('accept', 'decline', 'reschedule'));
    $at = $action === 'reschedule' ? $v->datetime('meeting_at', 'New date & time') : null;
    $v->done();
    $other = one_other_id($o, $me['id']);
    $name = first_name($me['full_name']);
    $link = '/app/121s?open=' . $o['id'];
    if ($action === 'accept') {
        update_row('one_to_ones', $o['id'], array('status' => 'scheduled'));
        notify($other, '121_accepted', $name . ' accepted your 121', when_text($o['meeting_at']), $link);
    } elseif ($action === 'decline') {
        update_row('one_to_ones', $o['id'], array('status' => 'declined'));
        notify($other, '121_declined', $name . ' declined the 121', when_text($o['meeting_at']), $link);
    } else {
        if (strtotime($at) < time() - 300) {
            fail('validation', 'Pick a future time.', 422, array('meeting_at' => 'Pick a future time.'));
        }
        update_row('one_to_ones', $o['id'], array('meeting_at' => $at, 'proposed_by' => $me['id']));
        notify($other, '121_request', $name . ' suggested another time for your 121', when_text($at), $link);
    }
    ok(true);
});

route('POST', '121s/log', function () {
    $me = require_member();
    $v = new V();
    $partnerId = $v->int('partner_id', 'Member met');
    $at = $v->datetime('meeting_at', 'Date & time');
    $mode = $v->enum('mode', 'Mode', array('in_person', 'online'), false, 'in_person');
    $details = one_details_from($v);
    $notes = $v->str('notes', 'Notes', false, 2000);
    $v->done();
    $p = approved_member_or_fail($partnerId, 'partner_id', $me['id'], 'You cannot log a 121 with yourself.');
    if (strtotime($at) > time() + 3600) {
        fail('validation', 'A logged 121 must have already happened. Use "Request a 121" to plan one.', 422, array('meeting_at' => 'Must be in the past.'));
    }
    $data = array_merge(array(
        'requester_id' => $me['id'], 'partner_id' => $p['id'], 'meeting_at' => $at, 'mode' => $mode,
        'status' => 'awaiting_confirmation', 'proposed_by' => $me['id'], 'logged_by' => $me['id'],
        'requester_notes' => $notes,
    ), $details);
    $id = insert('one_to_ones', $data);
    q('UPDATE one_to_ones SET code = ? WHERE id = ?', array(sprintf('BBA-M-%06d', $id), $id));
    notify($p['id'], '121_confirm', 'Did you meet ' . first_name($me['full_name']) . ' on ' . date('j M', strtotime($at)) . '?', 'Confirm the 121 so it counts for both of you.', '/app/121s?open=' . $id);
    ok(array('id' => $id, 'partner_name' => $p['full_name']));
});

route('POST', '121s/mark-done', function () {
    $me = require_member();
    $o = one_for_me(in_val('id'));
    $s = one_shape($o, $me['id']);
    if (!$s['can']['mark_done']) {
        fail('forbidden', 'This meeting cannot be marked as done yet.', 403);
    }
    $v = new V();
    $details = one_details_from($v);
    $notes = $v->str('notes', 'Notes', false, 2000);
    $v->done();
    $data = array('status' => 'awaiting_confirmation', 'logged_by' => $me['id']);
    foreach ($details as $k => $val) {
        if ($val !== null) {
            $data[$k] = $val;
        }
    }
    $data[(int) $o['requester_id'] === (int) $me['id'] ? 'requester_notes' : 'partner_notes'] = $notes;
    update_row('one_to_ones', $o['id'], $data);
    notify(one_other_id($o, $me['id']), '121_confirm', 'Did you meet ' . first_name($me['full_name']) . ' on ' . date('j M', strtotime($o['meeting_at'])) . '?', 'Confirm the 121 so it counts for both of you.', '/app/121s?open=' . $o['id']);
    ok(true);
});

route('POST', '121s/confirm', function () {
    $me = require_member();
    $o = one_for_me(in_val('id'));
    $s = one_shape($o, $me['id']);
    if (!$s['can']['confirm']) {
        fail('forbidden', 'This meeting is not waiting for your confirmation.', 403);
    }
    $v = new V();
    $action = $v->enum('action', 'Action', array('confirm', 'reject'));
    $notes = $v->str('notes', 'Notes', false, 2000);
    $v->done();
    $col = (int) $o['requester_id'] === (int) $me['id'] ? 'requester_notes' : 'partner_notes';
    $data = array($col => $notes);
    $name = first_name($me['full_name']);
    if ($action === 'confirm') {
        $data['status'] = 'completed';
        $data['confirmed_at'] = now();
        update_row('one_to_ones', $o['id'], $data);
        notify($o['logged_by'], '121_confirmed', '121 with ' . $name . ' confirmed', 'It now counts for both of you.', '/app/121s?open=' . $o['id']);
    } else {
        $data['status'] = 'cancelled';
        update_row('one_to_ones', $o['id'], $data);
        notify($o['logged_by'], '121_declined', $name . " said the 121 on " . date('j M', strtotime($o['meeting_at'])) . " didn't happen", $notes, '/app/121s?open=' . $o['id']);
    }
    ok(true);
});

route('POST', '121s/cancel', function () {
    $me = require_member();
    $o = one_for_me(in_val('id'));
    $s = one_shape($o, $me['id']);
    if (!$s['can']['cancel']) {
        fail('forbidden', 'This meeting cannot be cancelled.', 403);
    }
    update_row('one_to_ones', $o['id'], array('status' => 'cancelled'));
    notify(one_other_id($o, $me['id']), '121_declined', first_name($me['full_name']) . ' cancelled the 121 on ' . date('j M', strtotime($o['meeting_at'])), null, '/app/121s?open=' . $o['id']);
    ok(true);
});

/* ----------------------------- Photos ----------------------------- */

route('POST', '121s/photos', function () {
    $me = require_member();
    $o = one_for_me(isset($_POST['id']) ? $_POST['id'] : 0);
    if (in_array($o['status'], array('declined', 'cancelled'), true)) {
        fail('forbidden', 'Photos cannot be added to a cancelled 121.', 403);
    }
    if ((int) val('SELECT COUNT(*) FROM one_photos WHERE one_id = ?', array($o['id'])) >= ONE_PHOTOS_MAX) {
        fail('validation', 'A 121 can have up to ' . ONE_PHOTOS_MAX . ' photos.', 422, array('file' => 'Photo limit reached.'));
    }
    $name = save_one_photo('file');
    if (!$name) {
        fail('validation', 'Choose a photo to upload.', 422, array('file' => 'Choose a photo.'));
    }
    $id = insert('one_photos', array('one_id' => $o['id'], 'uploaded_by' => $me['id'], 'path' => $name));
    ok(array('id' => $id, 'mine' => true, 'created_at' => now()));
});

route('POST', '121s/photos/delete', function () {
    list($p, $me) = one_photo_for_me(in_val('id'));
    if ((int) $p['uploaded_by'] !== (int) $me['id'] && $me['role'] !== 'admin') {
        fail('forbidden', 'Only the member who added a photo can remove it.', 403);
    }
    q('DELETE FROM one_photos WHERE id = ?', array($p['id']));
    @unlink(PRIVATE_DIR . '/uploads/121/' . basename($p['path']));
    ok(true);
});

route('GET', 'files/121-photo', function () {
    list($p) = one_photo_for_me(qs('id', 0));
    $file = PRIVATE_DIR . '/uploads/121/' . basename($p['path']);
    if (!is_file($file)) {
        fail('not_found', 'File missing.', 404);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $name = $p['code'] . '-photo-' . $p['id'] . '.' . pathinfo($file, PATHINFO_EXTENSION);
    header('Content-Type: ' . $finfo->file($file));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: ' . (qs('download') ? 'attachment' : 'inline') . '; filename="' . $name . '"');
    // Files never change (a replaced photo gets a new id), so the browser may keep them.
    header('Cache-Control: private, max-age=604800');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
});
