<?php
/**
 * "Attend as a visitor": a public form on bbanetworking.com/visit. Admins edit
 * everything on it (fields, wording, payment QR, who gets alerted) from
 * Admin → Visitor form, and read the responses there.
 */

function visit_upload_dir()
{
    return PRIVATE_DIR . '/uploads/visit';
}

function visit_statuses()
{
    return array('new', 'contacted', 'confirmed', 'attended', 'cancelled');
}

function visit_field_types()
{
    return array('text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'file');
}

/** Fields every response must have, so the admin always knows who to call. */
function visit_locked_fields()
{
    return array('name' => 'text', 'mobile' => 'phone');
}

function visit_field($id, $label, $type, $required, $help = '', $options = array())
{
    return array('id' => $id, 'label' => $label, 'type' => $type, 'required' => $required, 'help' => $help, 'options' => $options);
}

function visit_form_defaults()
{
    return array(
        'enabled' => true,
        'title' => 'Attend as a visitor',
        'intro' => 'Come to a BBA meeting as our guest. You will meet business owners from the community, hear what they do, and see how members pass work to each other. Fill in your details and we will confirm your seat.',
        'show_meeting' => true,
        'fee_amount' => '',
        'payment_title' => 'Visitor fee',
        'payment_note' => 'Scan the QR code with any UPI app (GPay, PhonePe, Paytm) to pay the visitor fee, then attach a screenshot of the payment below.',
        'qr_path' => '',
        'upi_id' => '',
        'payment_link' => '',
        'submit_label' => 'Book my visit',
        'success_title' => 'You are on the list',
        'success_message' => 'Thank you for registering. Someone from BBA will call or WhatsApp you before the meeting to confirm your seat.',
        'closed_message' => 'Visitor registrations are closed right now. Please check back soon, or get in touch with us.',
        'notify_emails' => array(),
        'whatsapp_number' => '',
        'fields' => array(
            visit_field('name', 'Full name', 'text', true),
            visit_field('mobile', 'Mobile number', 'phone', true, 'We will confirm your visit on this number, usually on WhatsApp.'),
            visit_field('email', 'Email', 'email', false),
            visit_field('business', 'Business name', 'text', true),
            visit_field('category', 'What does your business do?', 'text', true, 'For example: interior design, catering, CA practice.'),
            visit_field('address', 'Address', 'textarea', false),
            visit_field('city', 'City', 'text', true),
            visit_field('invited_by', 'Who invited you?', 'text', false, 'Name of the BBA member, if someone invited you.'),
            visit_field('payment_proof', 'Payment screenshot', 'file', false, 'A photo or screenshot of the payment, or a PDF receipt.'),
        ),
    );
}

/** The saved form, with any setting added after it was saved filled in from the defaults. */
function visit_form()
{
    $d = visit_form_defaults();
    $saved = json_decode((string) setting('visit_form', ''), true);
    if (!is_array($saved)) {
        return $d;
    }
    foreach ($d as $k => $v) {
        if (!array_key_exists($k, $saved) || gettype($saved[$k]) !== gettype($v)) {
            $saved[$k] = $v;
        }
    }
    return array_intersect_key($saved, $d);
}

function visit_form_store($form)
{
    setting_set('visit_form', json_encode($form, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function visit_qr_url($form)
{
    return $form['qr_path'] ? app_url('/' . $form['qr_path']) : null;
}

/** bbanetworking.com/visit — the main domain is the dashboard's domain without "dashboard.". */
function visit_public_url()
{
    $app = rtrim((string) config('APP_URL', ''), '/');
    $site = preg_replace('#^(https?://)dashboard\.#', '$1', $app);
    return $site . '/visit';
}

function visit_upcoming_meetings($limit = 6)
{
    return all('SELECT id, title, meeting_date, start_time, venue FROM meetings WHERE meeting_date >= ? ORDER BY meeting_date, start_time LIMIT ' . (int) $limit, array(today()));
}

/** Validate an admin's edit of the form. Fails with a message naming the problem. */
function visit_form_clean($in, $current)
{
    $v = new V($in);
    $out = array(
        'enabled' => $v->bool('enabled') === 1,
        'title' => $v->str('title', 'Page title', true, 120),
        'intro' => (string) $v->str('intro', 'Introduction', false, 3000),
        'show_meeting' => $v->bool('show_meeting') === 1,
        'fee_amount' => '',
        'payment_title' => (string) $v->str('payment_title', 'Payment heading', false, 120),
        'payment_note' => (string) $v->str('payment_note', 'Payment instructions', false, 1500),
        'qr_path' => $current['qr_path'],
        'upi_id' => (string) $v->str('upi_id', 'UPI ID', false, 100),
        'payment_link' => (string) $v->url('payment_link', 'Payment link'),
        'submit_label' => $v->str('submit_label', 'Button text', true, 60),
        'success_title' => $v->str('success_title', 'Thank-you heading', true, 120),
        'success_message' => (string) $v->str('success_message', 'Thank-you message', false, 1500),
        'closed_message' => (string) $v->str('closed_message', 'Closed message', false, 1500),
        'notify_emails' => array(),
        'whatsapp_number' => '',
        'fields' => array(),
    );
    $fee = $v->money('fee_amount', 'Visitor fee', false);
    if ($fee !== null) {
        $out['fee_amount'] = rtrim(rtrim(number_format($fee, 2, '.', ''), '0'), '.');
    }
    if ($out['upi_id'] !== '' && !preg_match('/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/', $out['upi_id'])) {
        $v->error('upi_id', 'Enter a UPI ID like bba@okhdfcbank.');
    }
    $wa = $v->str('whatsapp_number', 'WhatsApp number', false, 20);
    if ($wa !== null) {
        $out['whatsapp_number'] = visit_phone_clean($wa);
        if ($out['whatsapp_number'] === null) {
            $v->error('whatsapp_number', 'Enter a valid WhatsApp number.');
        }
    }
    $emails = $v->raw('notify_emails');
    if (is_string($emails)) {
        $emails = preg_split('/[\s,;]+/', $emails);
    }
    foreach ((array) $emails as $em) {
        $em = strtolower(trim((string) $em));
        if ($em === '') {
            continue;
        }
        if (!filter_var($em, FILTER_VALIDATE_EMAIL)) {
            $v->error('notify_emails', '"' . mb_substr($em, 0, 60) . '" is not a valid email address.');
        } elseif (!in_array($em, $out['notify_emails'], true)) {
            $out['notify_emails'][] = $em;
        }
    }
    if (count($out['notify_emails']) > 10) {
        $v->error('notify_emails', 'Send alerts to at most 10 email addresses.');
    }

    $fields = $v->raw('fields');
    if (!is_array($fields) || !$fields) {
        $v->error('fields', 'The form needs at least the name and mobile fields.');
        $fields = array();
    }
    if (count($fields) > 40) {
        $v->error('fields', 'A form can have at most 40 questions.');
    }
    $seen = array();
    $locked = visit_locked_fields();
    foreach (array_values($fields) as $i => $f) {
        $n = $i + 1;
        if (!is_array($f)) {
            $v->error('fields', 'Question ' . $n . ' is not valid.');
            continue;
        }
        $id = isset($f['id']) ? (string) $f['id'] : '';
        if (!preg_match('/^[a-z][a-z0-9_]{0,39}$/', $id) || isset($seen[$id])) {
            $v->error('fields', 'Question ' . $n . ' has an invalid or repeated id.');
            continue;
        }
        $seen[$id] = true;
        $label = isset($f['label']) && is_scalar($f['label']) ? trim((string) $f['label']) : '';
        if ($label === '' || mb_strlen($label) > 150) {
            $v->error('field_' . $i, 'Question ' . $n . ' needs a label (up to 150 characters).');
        }
        $type = isset($f['type']) ? (string) $f['type'] : '';
        if (!in_array($type, visit_field_types(), true)) {
            $v->error('field_' . $i, 'Question ' . $n . ' has an unknown answer type.');
            continue;
        }
        $help = isset($f['help']) && is_scalar($f['help']) ? trim((string) $f['help']) : '';
        if (mb_strlen($help) > 300) {
            $v->error('field_' . $i, 'The hint under question ' . $n . ' is too long (300 characters max).');
        }
        $options = array();
        if ($type === 'select') {
            foreach ((isset($f['options']) && is_array($f['options']) ? $f['options'] : array()) as $o) {
                $o = trim(is_scalar($o) ? (string) $o : '');
                if ($o !== '' && mb_strlen($o) <= 100 && !in_array($o, $options, true)) {
                    $options[] = $o;
                }
            }
            if (count($options) < 1 || count($options) > 50) {
                $v->error('field_' . $i, 'Question ' . $n . ' ("' . mb_substr($label, 0, 40) . '") needs between 1 and 50 choices.');
            }
        }
        $required = !empty($f['required']);
        if (isset($locked[$id])) {
            $type = $locked[$id];
            $required = true;
        }
        $out['fields'][] = visit_field($id, $label, $type, $required, $help, $options);
    }
    foreach ($locked as $id => $t) {
        if (!isset($seen[$id])) {
            $v->error('fields', 'The name and mobile number questions cannot be removed.');
            break;
        }
    }
    $v->done();
    return $out;
}

/**
 * Indian mobiles become 10 digits; other countries keep a leading "+".
 * @return string|null null when it is not a phone number
 */
function visit_phone_clean($raw)
{
    $raw = trim((string) $raw);
    $digits = preg_replace('/\D+/', '', $raw);
    if (strpos($raw, '+') === 0 && substr($digits, 0, 2) !== '91') {
        return (strlen($digits) >= 8 && strlen($digits) <= 15) ? '+' . $digits : null;
    }
    $d = normalize_mobile($digits);
    return preg_match('/^[6-9]\d{9}$/', $d) ? $d : null;
}

/** wa.me link for a stored phone number. */
function visit_wa_link($phone, $text = '')
{
    $d = preg_replace('/\D+/', '', (string) $phone);
    if (strlen($d) === 10) {
        $d = '91' . $d;
    }
    return 'https://wa.me/' . $d . ($text !== '' ? '?text=' . rawurlencode($text) : '');
}

/** Stored answers keep their value under "value"; the API sends it as a string under "answer",
 *  a key ok() never turns into a number (phone numbers, PIN codes with leading zeros). */
function visit_answers($r)
{
    $answers = json_decode((string) $r['answers_json'], true);
    return is_array($answers) ? $answers : array();
}

function visit_request_shape($r)
{
    $out = array();
    foreach (visit_answers($r) as $a) {
        $out[] = array(
            'id' => (string) $a['id'],
            'label' => (string) $a['label'],
            'type' => (string) $a['type'],
            'answer' => $a['value'] === null ? null : (string) $a['value'],
        );
    }
    unset($r['answers_json'], $r['ip']);
    $r['answers'] = $out;
    return $r;
}

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

route('GET', 'public/visit-form', function () {
    $f = visit_form();
    $s = settings_all();
    ok(array(
        'enabled' => $f['enabled'],
        'title' => $f['title'],
        'intro' => $f['intro'],
        'closed_message' => $f['closed_message'],
        'submit_label' => $f['submit_label'],
        'success_title' => $f['success_title'],
        'success_message' => $f['success_message'],
        'whatsapp_number' => $f['whatsapp_number'],
        'payment' => array(
            'title' => $f['payment_title'],
            'note' => $f['payment_note'],
            'amount' => $f['fee_amount'],
            'qr_url' => visit_qr_url($f),
            'upi_id' => $f['upi_id'],
            'link' => $f['payment_link'],
        ),
        'fields' => $f['enabled'] ? $f['fields'] : array(),
        'meetings' => $f['enabled'] && $f['show_meeting'] ? visit_upcoming_meetings() : array(),
        'contact_phone' => isset($s['contact_phone']) ? (string) $s['contact_phone'] : '',
        'contact_email' => isset($s['contact_email']) ? (string) $s['contact_email'] : '',
    ));
}, array('public' => true));

route('POST', 'public/visit', function () {
    $form = visit_form();
    if (!$form['enabled']) {
        fail('closed', $form['closed_message'] !== '' ? $form['closed_message'] : 'Visitor registrations are closed right now.', 409);
    }
    // PHP silently drops a body over post_max_size: say so instead of "name is required".
    if (!$_POST && !$_FILES && isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 0) {
        fail('too_large', 'The attached file is too large. Please attach a smaller photo or PDF (under 5 MB).', 413);
    }
    $in = input();
    if (!empty($in['website'])) {
        ok(array('code' => null)); // honeypot field: only bots fill it in
    }
    // Generous: mobile networks put many people behind one IP, and visitors may register together on venue Wi-Fi.
    $hourAgo = date('Y-m-d H:i:s', time() - 3600);
    if ((int) val('SELECT COUNT(*) FROM visit_requests WHERE ip = ? AND created_at > ?', array(client_ip(), $hourAgo)) >= 20) {
        fail('rate_limited', 'Too many registrations from this connection. Please try again in an hour.', 429);
    }

    $v = new V($in);
    $answers = array();
    $uploads = array();
    foreach ($form['fields'] as $f) {
        $key = $f['id'];
        $label = $f['label'];
        $value = '';
        if ($f['type'] === 'file') {
            $has = !empty($_FILES['file_' . $key]) && is_array($_FILES['file_' . $key]) && $_FILES['file_' . $key]['error'] !== UPLOAD_ERR_NO_FILE;
            if ($has) {
                $uploads[$key] = count($answers);
            } elseif ($f['required']) {
                $v->error($key, 'Attach ' . mb_strtolower($label) . '.');
            }
        } elseif ($f['type'] === 'checkbox') {
            $value = $v->bool($key) ? 'Yes' : 'No';
            if ($f['required'] && $value !== 'Yes') {
                $v->error($key, 'Please tick this box to continue.');
            }
        } else {
            $raw = $v->raw($key);
            $s = is_scalar($raw) ? trim((string) $raw) : '';
            if ($s === '') {
                if ($f['required']) {
                    $v->error($key, $label . ' is required.');
                }
            } else {
                $value = $s;
                $max = $f['type'] === 'textarea' ? 3000 : 300;
                if (mb_strlen($s) > $max) {
                    $v->error($key, $label . ' must be ' . $max . ' characters or fewer.');
                } elseif ($f['type'] === 'email') {
                    $value = strtolower($s);
                    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                        $v->error($key, 'Enter a valid email address.');
                    }
                } elseif ($f['type'] === 'phone') {
                    $value = visit_phone_clean($s);
                    if ($value === null) {
                        $v->error($key, 'Enter a valid mobile number.');
                    }
                } elseif ($f['type'] === 'number') {
                    $n = str_replace(array(',', ' ', '₹'), '', $s);
                    if (!is_numeric($n) || abs((float) $n) > 999999999999) {
                        $v->error($key, 'Enter a number.');
                    }
                    $value = $n;
                } elseif ($f['type'] === 'date') {
                    $d = DateTime::createFromFormat('Y-m-d', $s);
                    if (!$d || $d->format('Y-m-d') !== $s) {
                        $v->error($key, 'Enter a valid date.');
                    }
                } elseif ($f['type'] === 'select' && !in_array($s, $f['options'], true)) {
                    $v->error($key, 'Choose one of the options.');
                }
            }
        }
        $answers[] = array('id' => $key, 'label' => $label, 'type' => $f['type'], 'value' => $value);
    }

    $meetingId = null;
    if ($form['show_meeting']) {
        $upcoming = visit_upcoming_meetings();
        if ($upcoming) {
            $want = (int) $v->raw('meeting_id');
            foreach ($upcoming as $m) {
                if ((int) $m['id'] === $want) {
                    $meetingId = $want;
                }
            }
            if (!$meetingId) {
                $v->error('meeting_id', 'Choose the meeting you will attend.');
            }
        }
    }
    $v->done();

    $byId = array();
    foreach ($answers as $a) {
        $byId[$a['id']] = $a['value'];
    }
    $name = $byId['name'];
    $mobile = $byId['mobile'];

    // A double tap or a resubmitted page: same person, same meeting, a few minutes apart.
    $dupe = one('SELECT id, code FROM visit_requests WHERE mobile = ? AND created_at > ? AND ' . ($meetingId ? 'meeting_id = ?' : 'meeting_id IS NULL') . ' ORDER BY id DESC LIMIT 1',
        $meetingId ? array($mobile, date('Y-m-d H:i:s', time() - 900), $meetingId) : array($mobile, date('Y-m-d H:i:s', time() - 900)));
    if ($dupe) {
        ok(array('code' => $dupe['code']));
    }

    $types = image_types();
    $types['application/pdf'] = 'pdf';
    foreach ($uploads as $key => $idx) {
        $answers[$idx]['value'] = upload_from('file_' . $key, $types, visit_upload_dir());
    }

    $email = null;
    foreach ($form['fields'] as $f) {
        if ($f['type'] === 'email' && $byId[$f['id']] !== '') {
            $email = $byId[$f['id']];
            break;
        }
    }
    $id = insert('visit_requests', array(
        'name' => mb_substr($name, 0, 120),
        'mobile' => $mobile,
        'email' => $email,
        'answers_json' => json_encode($answers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'meeting_id' => $meetingId,
        'status' => 'new',
        'ip' => client_ip(),
    ));
    $code = sprintf('VIS-%04d', $id);
    q('UPDATE visit_requests SET code = ? WHERE id = ?', array($code, $id));

    $meeting = $meetingId ? one('SELECT title, meeting_date, start_time FROM meetings WHERE id = ?', array($meetingId)) : null;
    $when = $meeting ? $meeting['title'] . ', ' . date('D j M', strtotime($meeting['meeting_date'])) : '';
    notify_admins('visit_request', 'New visitor: ' . $name, trim(($when ? $when . ' · ' : '') . $mobile), '/admin/visitor-form?r=' . $id);
    visit_send_alert($form, $id, $code, $name, $mobile, $answers, $when);
    ok(array('code' => $code));
}, array('public' => true, 'csrf' => false));

/** Email the new registration to the form's alert list (or to every admin if the list is empty). */
function visit_send_alert($form, $id, $code, $name, $mobile, $answers, $when)
{
    $to = $form['notify_emails'];
    if (!$to) {
        foreach (all("SELECT email FROM members WHERE role = 'admin' AND status = 'approved'") as $a) {
            $to[] = $a['email'];
        }
    }
    if (!$to) {
        return;
    }
    $rows = '';
    foreach ($answers as $a) {
        $val = $a['type'] === 'file' ? ($a['value'] ? 'Attached (open it in the dashboard)' : '') : $a['value'];
        if ($val === '') {
            continue;
        }
        $rows .= '<tr><td style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px;color:#8A8A8A;white-space:nowrap">' . e($a['label']) . '</td>'
            . '<td style="padding:8px 0;font-size:15px;color:#1C1C1C">' . nl2br(e($val)) . '</td></tr>';
    }
    $wa = '<a href="' . e(visit_wa_link($mobile, 'Hello ' . first_name($name) . ', thank you for registering to visit BBA.')) . '" style="color:#7A5500;font-weight:700">Message ' . e(first_name($name)) . ' on WhatsApp</a>';
    send_mail(
        $to,
        'New visitor: ' . $name . ($when ? ' (' . $when . ')' : ''),
        'New visitor registration',
        array(
            $name . ' registered to attend ' . ($when ? $when : 'a BBA meeting') . ' as a visitor. Reference ' . $code . '.',
            '<raw><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">' . $rows . '</table>',
            '<raw><p style="margin:0 0 20px;font-size:15px">' . $wa . '</p>',
        ),
        array('label' => 'Open in the dashboard', 'url' => app_url('/admin/visitor-form?r=' . $id))
    );
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

route('GET', 'admin/visit-form', function () {
    require_admin();
    $f = visit_form();
    $f['qr_url'] = visit_qr_url($f);
    ok(array(
        'form' => $f,
        'defaults' => visit_form_defaults(),
        'public_url' => visit_public_url(),
        'upcoming_meetings' => count(visit_upcoming_meetings()),
        'admin_emails' => array_map(function ($r) {
            return $r['email'];
        }, all("SELECT email FROM members WHERE role = 'admin' AND status = 'approved' ORDER BY id")),
    ));
});

route('POST', 'admin/visit-form/save', function () {
    require_admin();
    $before = visit_form();
    $form = visit_form_clean(input(), $before);
    visit_form_store($form);
    list($b, $a) = diff_pair(array_map('json_encode', $before), array_map('json_encode', $form));
    if ($a) {
        audit('visit_form_saved', 'settings', null, array('changed' => array_keys($b)), array('changed' => array_keys($a)));
    }
    $form['qr_url'] = visit_qr_url($form);
    ok($form);
});

route('POST', 'admin/visit-form/qr', function () {
    require_admin();
    $name = upload_from('file', image_types(), public_root() . '/uploads/site');
    if (!$name) {
        fail('validation', 'Choose an image of the QR code.', 422, array('file' => 'Choose an image.'));
    }
    upload_guard(public_root() . '/uploads/site');
    $form = visit_form();
    visit_delete_qr($form['qr_path']);
    $form['qr_path'] = 'uploads/site/' . $name;
    visit_form_store($form);
    audit('visit_qr_changed', 'settings', null, null, array('qr_path' => $form['qr_path']));
    ok(array('qr_url' => visit_qr_url($form)));
});

route('POST', 'admin/visit-form/qr/remove', function () {
    require_admin();
    $form = visit_form();
    visit_delete_qr($form['qr_path']);
    $form['qr_path'] = '';
    visit_form_store($form);
    audit('visit_qr_removed', 'settings');
    ok(true);
});

function visit_delete_qr($path)
{
    if ($path && preg_match('#^uploads/site/[a-f0-9]{32}\.(webp|jpg|png)$#', $path)) {
        @unlink(public_root() . '/' . $path);
    }
}

route('GET', 'admin/visit-requests', function () {
    require_admin();
    $rows = all('SELECT r.*, mt.title AS meeting_title, mt.meeting_date, mt.start_time FROM visit_requests r
        LEFT JOIN meetings mt ON mt.id = r.meeting_id ORDER BY r.id DESC');
    $counts = array_fill_keys(visit_statuses(), 0);
    $items = array();
    foreach ($rows as $r) {
        if (isset($counts[$r['status']])) {
            $counts[$r['status']]++;
        }
        $items[] = visit_request_shape($r);
    }
    ok(array('items' => $items, 'counts' => $counts, 'total' => count($items)));
});

route('POST', 'admin/visit-requests/update', function () {
    require_admin();
    $v = new V();
    $id = $v->int('id', 'Response');
    $status = $v->enum('status', 'Status', visit_statuses(), false);
    $note = $v->str('admin_note', 'Note', false, 2000);
    $v->done();
    $before = one('SELECT id, status, admin_note FROM visit_requests WHERE id = ?', array($id));
    if (!$before) {
        fail('not_found', 'That response no longer exists.', 404);
    }
    $data = array();
    if ($status !== null) {
        $data['status'] = $status;
    }
    if (array_key_exists('admin_note', input())) {
        $data['admin_note'] = $note;
    }
    update_row('visit_requests', $id, $data);
    list($b, $a) = diff_pair($before, $data);
    if ($a) {
        audit('visit_request_updated', 'visit_request', $id, $b, $a);
    }
    ok(true);
});

route('POST', 'admin/visit-requests/delete', function () {
    require_admin();
    $r = one('SELECT * FROM visit_requests WHERE id = ?', array((int) in_val('id')));
    if (!$r) {
        fail('not_found', 'That response no longer exists.', 404);
    }
    foreach (visit_answers($r) as $a) {
        if ($a['type'] === 'file' && $a['value'] && preg_match('/^[a-f0-9]{32}\.(webp|jpg|png|pdf)$/', $a['value'])) {
            @unlink(visit_upload_dir() . '/' . $a['value']);
        }
    }
    q('DELETE FROM visit_requests WHERE id = ?', array($r['id']));
    audit('visit_request_deleted', 'visit_request', (int) $r['id'], array('code' => $r['code'], 'name' => $r['name'], 'mobile' => $r['mobile']));
    ok(true);
});

/** An attachment on a response (payment screenshot etc.). Admins only. */
route('GET', 'files/visit-upload', function () {
    require_admin();
    $r = one('SELECT * FROM visit_requests WHERE id = ?', array(qs_int('id')));
    $file = null;
    if ($r) {
        foreach (visit_answers($r) as $a) {
            if ($a['type'] === 'file' && $a['id'] === qs('field') && preg_match('/^[a-f0-9]{32}\.(webp|jpg|png|pdf)$/', (string) $a['value'])) {
                $file = visit_upload_dir() . '/' . $a['value'];
            }
        }
    }
    if (!$file || !is_file($file)) {
        fail('not_found', 'File missing.', 404);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    header('Content-Type: ' . $finfo->file($file));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: ' . (qs('download') ? 'attachment' : 'inline') . '; filename="' . $r['code'] . '-' . preg_replace('/[^a-z0-9_]/', '', qs('field')) . '.' . pathinfo($file, PATHINFO_EXTENSION) . '"');
    header('Cache-Control: private, max-age=604800');
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    exit;
});
