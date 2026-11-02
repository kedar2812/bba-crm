<?php

function tag_words($s)
{
    $words = array();
    foreach (split_tags($s) as $tag) {
        foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($tag)) as $w) {
            if (mb_strlen($w) >= 3 && !in_array($w, array('and', 'the', 'for', 'all', 'services', 'service', 'products', 'product'), true)) {
                $words[$w] = true;
            }
        }
    }
    return array_keys($words);
}

route('GET', 'members', function () {
    $me = require_member();
    $where = array("m.status = 'approved'", "m.role = 'member'");
    $params = array();
    $search = qs('q');
    if ($search) {
        $like = '%' . $search . '%';
        $where[] = '(m.full_name LIKE ? OR m.business_name LIKE ? OR c.name LIKE ? OR m.category_other LIKE ? OR m.offers LIKE ? OR m.looking_for LIKE ? OR m.city LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like, $like, $like);
    }
    if (qs_int('category')) {
        $where[] = 'm.category_id = ?';
        $params[] = qs_int('category');
    }
    if (qs('city')) {
        $where[] = 'm.city = ?';
        $params[] = qs('city');
    }
    $rows = all('SELECT m.id, m.full_name, m.business_name, m.designation, m.photo_path, m.city, m.offers, m.looking_for, m.category_other, c.name AS category_name
        FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE ' . implode(' AND ', $where) . ' ORDER BY m.full_name LIMIT 500', $params);

    $match = qs('match') === '1';
    $myWords = $match ? tag_words($me['offers']) : array();
    $items = array();
    foreach ($rows as $r) {
        $item = array(
            'id' => (int) $r['id'],
            'full_name' => $r['full_name'],
            'business_name' => $r['business_name'],
            'designation' => $r['designation'],
            'photo_url' => photo_url($r['photo_path']),
            'city' => $r['city'],
            'category' => $r['category_other'] ? $r['category_other'] : $r['category_name'],
            'offers' => array_slice(split_tags($r['offers']), 0, 3),
        );
        if ($match) {
            if ((int) $r['id'] === (int) $me['id']) {
                continue;
            }
            $hits = array_intersect($myWords, tag_words($r['looking_for']));
            if (!$hits) {
                continue;
            }
            $item['match_score'] = count($hits);
            $item['looking_for'] = split_tags($r['looking_for']);
        }
        $items[] = $item;
    }
    if ($match) {
        usort($items, function ($a, $b) {
            return $b['match_score'] - $a['match_score'];
        });
    }
    $cities = array();
    foreach (all("SELECT DISTINCT city FROM members WHERE status = 'approved' AND role = 'member' AND city <> '' ORDER BY city") as $c) {
        $cities[] = $c['city'];
    }
    ok(array('items' => $items, 'cities' => $cities, 'my_offers' => split_tags($me['offers'])));
});

/** Lightweight list for pickers. */
/** Active members for the searchable picker (admins are not members), minus one id. */
function member_picker_rows($exceptId)
{
    $rows = all("SELECT m.id, m.full_name, m.business_name, m.photo_path, m.city, m.category_other, c.name AS category_name
        FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE m.status = 'approved' AND m.role = 'member' AND m.id <> ? ORDER BY m.full_name", array((int) $exceptId));
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'id' => (int) $r['id'],
            'full_name' => $r['full_name'],
            'business_name' => $r['business_name'],
            'photo_url' => photo_url($r['photo_path']),
            'category' => $r['category_other'] ? $r['category_other'] : $r['category_name'],
        );
    }
    return $out;
}

route('GET', 'members/picker', function () {
    $me = require_member();
    ok(member_picker_rows($me['id']));
});

route('GET', 'admin/members/picker', function () {
    require_admin();
    ok(member_picker_rows(0));
});

route('GET', 'members/view', function () {
    $me = require_member();
    $m = one('SELECT m.*, c.name AS category_name FROM members m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?', array(qs_int('id')));
    // Admin accounts have no member profile.
    if (!$m || $m['status'] !== 'approved' || $m['role'] === 'admin') {
        fail('not_found', 'Member not found.', 404);
    }
    $id = (int) $m['id'];
    $out = array(
        'id' => $id,
        'full_name' => $m['full_name'],
        'designation' => $m['designation'],
        'business_name' => $m['business_name'],
        'category' => $m['category_other'] ? $m['category_other'] : $m['category_name'],
        'photo_url' => photo_url($m['photo_path']),
        'mobile' => $m['mobile'],
        'email' => $m['email'],
        'city' => $m['city'],
        'address' => $m['address'],
        'business_description' => $m['business_description'],
        'website' => $m['website'],
        'instagram' => $m['instagram'],
        'linkedin' => $m['linkedin'],
        'facebook' => $m['facebook'],
        'offers' => split_tags($m['offers']),
        'looking_for' => split_tags($m['looking_for']),
        'member_since' => $m['approved_at'] ? $m['approved_at'] : $m['created_at'],
        'is_me' => $id === (int) $me['id'],
        'stats' => stats_for($id, '2000-01-01', '2999-12-31'),
    );
    $tq = 'SELECT t.id, t.body, t.is_visible, t.created_at, t.updated_at, t.author_id, a.full_name AS author_name, a.business_name AS author_business, a.photo_path AS author_photo
        FROM testimonials t JOIN members a ON a.id = t.author_id WHERE t.subject_id = ?';
    $tq .= $id === (int) $me['id'] ? '' : ' AND t.is_visible = 1';
    $tests = array();
    foreach (all($tq . ' ORDER BY t.updated_at DESC', array($id)) as $t) {
        $t['author_photo_url'] = photo_url($t['author_photo']);
        unset($t['author_photo']);
        $tests[] = $t;
    }
    $out['testimonials'] = $tests;
    $mine = one('SELECT id, body FROM testimonials WHERE author_id = ? AND subject_id = ?', array($me['id'], $id));
    $out['my_testimonial'] = $mine;
    ok($out);
});

function profile_fields_from($v, $partial = false)
{
    $d = array(
        'full_name' => $v->str('full_name', 'Full name', true, 120, 2),
        'mobile' => $v->mobile('mobile'),
        'business_name' => $v->str('business_name', 'Business name', true, 150),
        'category_id' => $v->int('category_id', 'Category', true),
        'category_other' => $v->str('category_other', 'Category', false, 120),
        'designation' => $v->str('designation', 'Designation', true, 120),
        'business_description' => $v->str('business_description', 'Business description', true, 500),
        'address' => $v->str('address', 'Address', true, 500),
        'city' => $v->str('city', 'City', true, 80),
        'website' => $v->url('website', 'Website'),
        'instagram' => $v->url('instagram', 'Instagram'),
        'linkedin' => $v->url('linkedin', 'LinkedIn'),
        'facebook' => $v->url('facebook', 'Facebook'),
        'offers' => $v->tags('offers', 'What you offer', true),
        'looking_for' => $v->tags('looking_for', 'What you are looking for'),
    );
    if ($d['category_id'] && !one('SELECT id FROM categories WHERE id = ?', array($d['category_id']))) {
        $v->error('category_id', 'Pick a category from the list.');
    }
    return $d;
}

route('POST', 'profile/update', function () {
    $me = require_member();
    $v = new V();
    $d = profile_fields_from($v);
    $v->done();
    if (one('SELECT id FROM members WHERE mobile = ? AND id <> ?', array($d['mobile'], $me['id']))) {
        fail('validation', 'That mobile number belongs to another member.', 422, array('mobile' => 'Already registered to another member.'));
    }
    update_row('members', $me['id'], $d);
    ok(array('member' => me_payload(current_member(true))));
});

route('POST', 'profile/photo', function () {
    $me = require_member();
    $path = save_avatar('photo');
    if (!$path) {
        fail('validation', 'Choose a photo.', 422, array('photo' => 'Choose a photo.'));
    }
    delete_avatar($me['photo_path']);
    update_row('members', $me['id'], array('photo_path' => $path));
    ok(array('photo_url' => photo_url($path)));
});

route('POST', 'testimonials/save', function () {
    $me = require_member();
    $v = new V();
    $subject = $v->int('subject_id', 'Member');
    $body = $v->str('body', 'Testimonial', true, 1000, 10);
    $v->done();
    $s = approved_member_or_fail($subject, 'subject_id', $me['id'], 'You cannot write a testimonial for yourself.');
    $existing = one('SELECT id FROM testimonials WHERE author_id = ? AND subject_id = ?', array($me['id'], $s['id']));
    if ($existing) {
        update_row('testimonials', $existing['id'], array('body' => $body));
    } else {
        insert('testimonials', array('author_id' => $me['id'], 'subject_id' => $s['id'], 'body' => $body, 'is_visible' => 1));
        notify($s['id'], 'testimonial', first_name($me['full_name']) . ' wrote you a testimonial', mb_substr($body, 0, 140), '/app/members/' . $s['id']);
    }
    ok(true);
});

route('POST', 'testimonials/visibility', function () {
    $me = require_member();
    $t = one('SELECT * FROM testimonials WHERE id = ?', array((int) in_val('id')));
    if (!$t || ((int) $t['subject_id'] !== (int) $me['id'] && $me['role'] !== 'admin')) {
        fail('forbidden', 'You can only change testimonials written about you.', 403);
    }
    update_row('testimonials', $t['id'], array('is_visible' => in_val('visible') ? 1 : 0));
    ok(true);
});
