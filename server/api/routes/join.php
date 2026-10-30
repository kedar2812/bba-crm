<?php

/** Validate the full join payload; returns the cleaned member fields. */
function join_validate($in)
{
    $v = new V($in);
    $d = array();
    $d['full_name'] = $v->str('full_name', 'Full name', true, 120, 2);
    $d['mobile'] = $v->mobile('mobile');
    $d['email'] = $v->email('email');
    $d['its_number'] = $v->str('its_number', 'ITS number', true, 20);
    if ($d['its_number'] !== null && !preg_match('/^\d{8}$/', $d['its_number'])) {
        $v->error('its_number', 'ITS number must be exactly 8 digits.');
    }
    $pass = $v->str('password', 'Password', true, 200, 8);
    $d['business_name'] = $v->str('business_name', 'Business name', true, 150);
    $d['category_id'] = $v->int('category_id', 'Business category', true);
    $d['category_other'] = $v->str('category_other', 'Category', false, 120);
    $d['designation'] = $v->str('designation', 'Designation', true, 120);
    $d['business_description'] = $v->str('business_description', 'Business description', true, 500);
    $d['address'] = $v->str('address', 'Business address', true, 500);
    $d['city'] = $v->str('city', 'City', true, 80);
    $d['website'] = $v->url('website', 'Website');
    $d['instagram'] = $v->url('instagram', 'Instagram');
    $d['linkedin'] = $v->url('linkedin', 'LinkedIn');
    $d['facebook'] = $v->url('facebook', 'Facebook');
    $d['offers'] = $v->tags('offers', 'Products & services you offer', true);
    $d['looking_for'] = $v->tags('looking_for', 'What you are looking for');
    $d['referred_by_text'] = $v->str('referred_by_text', 'Referred by', false, 150);
    if (!$v->bool('consent')) {
        $v->error('consent', 'Please agree to share your details with BBA members.');
    }
    if ($d['category_id'] && !one('SELECT id FROM categories WHERE id = ? AND is_archived = 0', array($d['category_id']))) {
        $v->error('category_id', 'Pick a category from the list.');
    }
    if ($d['category_id'] && strtolower((string) val('SELECT name FROM categories WHERE id = ?', array($d['category_id']))) === 'other' && !$d['category_other']) {
        $v->error('category_other', 'Tell us your category.');
    }
    $v->done();
    $d['password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
    return $d;
}

function join_unique_check($d)
{
    $fields = array();
    $login = ' Log in instead?';
    if (one('SELECT id FROM members WHERE email = ?', array($d['email']))) {
        $fields['email'] = 'This email is already registered.' . $login;
    }
    if (one('SELECT id FROM members WHERE mobile = ?', array($d['mobile']))) {
        $fields['mobile'] = 'This mobile number is already registered.' . $login;
    }
    if (one('SELECT id FROM members WHERE its_number = ?', array($d['its_number']))) {
        $fields['its_number'] = 'This ITS number is already registered.' . $login;
    }
    if ($fields) {
        fail('duplicate', reset($fields), 409, $fields);
    }
}

route('POST', 'join/start', function () {
    $d = join_validate(input());
    join_unique_check($d);
    $photo = save_tmp_photo('photo');
    if (!$photo) {
        fail('validation', 'Please add a profile photo.', 422, array('photo' => 'Please add a profile photo.'));
    }
    $old = all('SELECT photo_tmp_path FROM pending_applications WHERE email = ?', array($d['email']));
    foreach ($old as $o) {
        if ($o['photo_tmp_path']) {
            @unlink(PRIVATE_DIR . '/uploads/tmp/' . basename($o['photo_tmp_path']));
        }
    }
    q('DELETE FROM pending_applications WHERE email = ? OR expires_at < ?', array($d['email'], now()));
    $code = otp_issue($d['email'], 'join');
    insert('pending_applications', array(
        'email' => $d['email'],
        'payload_json' => json_encode($d, JSON_UNESCAPED_UNICODE),
        'photo_tmp_path' => $photo,
        'expires_at' => date('Y-m-d H:i:s', time() + 86400),
    ));
    if (!otp_send($d['email'], $code, 'join', $d['full_name'])) {
        fail('mail_failed', "Couldn't send the code. Try again in a minute.", 502);
    }
    ok(array('email' => $d['email'], 'cooldown' => 60));
}, array('public' => true));

route('POST', 'join/resend', function () {
    $v = new V();
    $email = $v->email('email');
    $v->done();
    $p = one('SELECT * FROM pending_applications WHERE email = ? AND expires_at > ? ORDER BY id DESC LIMIT 1', array($email, now()));
    if (!$p) {
        fail('expired', 'Your application session expired. Please submit the form again.', 410);
    }
    $d = json_decode($p['payload_json'], true);
    $code = otp_issue($email, 'join');
    if (!otp_send($email, $code, 'join', $d['full_name'])) {
        fail('mail_failed', "Couldn't send the code. Try again in a minute.", 502);
    }
    ok(array('cooldown' => 60));
}, array('public' => true));

route('POST', 'join/verify', function () {
    $v = new V();
    $email = $v->email('email');
    $code = $v->str('code', 'Code', true, 6);
    $v->done();
    $p = one('SELECT * FROM pending_applications WHERE email = ? AND expires_at > ? ORDER BY id DESC LIMIT 1', array($email, now()));
    if (!$p) {
        fail('expired', 'Your application session expired. Please submit the form again.', 410);
    }
    otp_verify($email, 'join', $code);
    $d = json_decode($p['payload_json'], true);
    join_unique_check($d);

    $d['photo_path'] = promote_tmp_photo($p['photo_tmp_path']);
    $d['status'] = 'pending_review';
    $d['role'] = 'member';
    $d['email_verified_at'] = now();
    $id = insert('members', $d);
    q('DELETE FROM pending_applications WHERE email = ?', array($email));

    // A visitor who later applies with the same mobile is linked to their inviter.
    q("UPDATE visitors SET joined_member_id = ?, updated_at = ? WHERE mobile = ? AND joined_member_id IS NULL", array($id, now(), $d['mobile']));

    notify_admins('application', 'New membership application', $d['full_name'] . ' · ' . $d['business_name'], '/admin/applications');
    send_mail($email, 'Application received — BBA', 'Application received', array(
        'Hi ' . first_name($d['full_name']) . ',',
        'Thank you for applying to join the Burhani Business Association. The BBA team will review your application and email you once a decision is made.',
    ));
    ok(true);
}, array('public' => true));
