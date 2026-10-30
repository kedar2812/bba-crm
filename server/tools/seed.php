<?php
/**
 * DEV ONLY — never deployed. Fills the local database with realistic fake data:
 * 25 members, 80 referrals, 40 121s, 20 visitors, 6 meetings.
 *   php -d extension=pdo_sqlite server/tools/seed.php
 */
define('API_ROOT', dirname(__DIR__) . '/api');
define('PRIVATE_DIR', API_ROOT . '/_private');
date_default_timezone_set('Asia/Kolkata');
require API_ROOT . '/lib/core.php';
require API_ROOT . '/lib/schema.php';
if (config('APP_URL') !== 'http://localhost:5173') {
    exit("Refusing to seed a non-local database.\n");
}
run_migrations();
@file_put_contents(PRIVATE_DIR . '/data/.schema-v' . schema_version(), now());
mt_srand(42);

$first = array('Ali', 'Fatema', 'Hussain', 'Zainab', 'Murtaza', 'Sakina', 'Taher', 'Insiya', 'Mustafa', 'Rashida', 'Aliasgar', 'Tasneem', 'Huzefa', 'Batul', 'Qutbuddin', 'Arwa', 'Yusuf', 'Maria', 'Abbas', 'Nafisa', 'Shabbir', 'Rukaiya', 'Burhanuddin', 'Munira', 'Saifuddin');
$last = array('Lokhandwala', 'Rangwala', 'Kapadia', 'Bohari', 'Tinwala', 'Electricwala', 'Dhorajiwala', 'Merchant', 'Chashmawala', 'Saifee');
$biz = array(
    array('Lokhandwala Interiors', 1, 'Interior fit-outs, Modular kitchens, Office design', 'Real estate leads, Builders'),
    array('Rangwala Constructions', 2, 'Residential construction, Renovation', 'Interior designers, Steel suppliers'),
    array('Kapadia Realty', 3, 'Flats for sale, Commercial leasing', 'Home loans, Interior fit-outs'),
    array('Bohari Fashions', 5, 'Ethnic wear, Bulk uniforms', 'Retail space, Photography'),
    array('Tinwala Caterers', 6, 'Wedding catering, Corporate lunches', 'Event planners, Banquet halls'),
    array('Saifee Travels', 7, 'Hajj and Ziyarat tours, Air tickets', 'Corporate clients, Insurance'),
    array('Merchant Finserv', 8, 'Home loans, Insurance, Mutual funds', 'Real estate leads, Business owners'),
    array('Electricwala Tech', 9, 'Websites, Mobile apps, CRM software', 'Retail clients, Restaurants'),
    array('Dhorajiwala Clinic', 10, 'Dental care, Health checkups', 'Corporate wellness, Schools'),
    array('Chashmawala Optics', 4, 'Spectacles, Contact lenses', 'Schools, Corporate eye camps'),
);
$cities = array('Pune', 'Pune', 'Pune', 'Mumbai', 'Mumbai', 'Surat');
$ids = array((int) val("SELECT id FROM members WHERE role='admin' LIMIT 1"));
for ($i = 0; $i < 25; $i++) {
    $b = $biz[$i % count($biz)];
    $name = $first[$i] . ' ' . $last[$i % count($last)];
    $email = strtolower($first[$i]) . '@bba.test';
    if (one('SELECT id FROM members WHERE email = ?', array($email))) {
        continue;
    }
    $ids[] = insert('members', array(
        'role' => 'member', 'status' => $i < 22 ? 'approved' : 'pending_review',
        'full_name' => $name, 'email' => $email, 'mobile' => '98' . str_pad((string) (10000000 + $i * 7919), 8, '0', STR_PAD_LEFT),
        'its_number' => (string) (20000000 + $i), 'password_hash' => password_hash('member12345', PASSWORD_DEFAULT),
        'business_name' => $b[0] . ($i >= 10 ? ' ' . ($i < 20 ? 'Group' : 'Co.') : ''), 'category_id' => $b[1], 'designation' => $i % 3 ? 'Proprietor' : 'Director',
        'business_description' => 'We have served clients across ' . $cities[$i % 6] . ' for over ' . (3 + $i % 15) . ' years with a focus on quality and trust.',
        'address' => (10 + $i) . ' Camp Road', 'city' => $cities[$i % 6], 'offers' => $b[2], 'looking_for' => $b[3],
        'email_verified_at' => now(), 'approved_at' => $i < 22 ? date('Y-m-d H:i:s', strtotime('-' . (200 - $i * 7) . ' days')) : null,
        'approved_by' => $i < 22 ? $ids[0] : null,
        'created_at' => date('Y-m-d H:i:s', strtotime('-' . (210 - $i * 7) . ' days')),
    ));
}
$approved = array();
foreach (all("SELECT id FROM members WHERE status='approved'") as $r) {
    $approved[] = (int) $r['id'];
}
$pick = function ($not = 0) use ($approved) {
    do {
        $x = $approved[mt_rand(0, count($approved) - 1)];
    } while ($x === $not);
    return $x;
};
$clients = array('Sunrise Apartments', 'Mehta Exports', 'Green Leaf Cafe', 'Shah and Sons', 'Nova Schools', 'Prime Motors', 'Royal Banquets', 'City Hospital', 'Blue Ocean Traders', 'Om Textiles');
$needs = array('Office interior fit-out', '3BHK flat purchase', 'Website redesign', 'Wedding catering for 400', 'Group Umrah tour', 'Term insurance', 'Uniforms for 200 staff', 'Annual eye camp', 'Home loan', 'Kitchen renovation');
$statuses = array('new', 'contacted', 'in_progress', 'won', 'won', 'won', 'lost');
if ((int) val('SELECT COUNT(*) FROM referrals') === 0) {
    for ($i = 0; $i < 80; $i++) {
        $g = $pick();
        $r = $pick($g);
        $days = mt_rand(0, 175);
        $date = date('Y-m-d', strtotime('-' . $days . ' days'));
        $st = $statuses[mt_rand(0, count($statuses) - 1)];
        $est = mt_rand(2, 80) * 10000;
        $direct = $i % 9 === 0;
        $won = $direct || $st === 'won';
        $id = insert('referrals', array(
            'type' => $direct ? 'direct' : 'referral', 'giver_id' => $g, 'receiver_id' => $r, 'created_by' => $direct ? $r : $g,
            'client_name' => $clients[$i % 10], 'client_phone' => '97' . mt_rand(10000000, 99999999), 'requirement' => $needs[mt_rand(0, 9)],
            'estimated_value' => $est, 'referral_date' => $date, 'status' => $won ? 'won' : $st,
            'final_value' => $won ? round($est * mt_rand(60, 120) / 100, -3) : null,
            'won_date' => $won ? date('Y-m-d', min(time(), strtotime($date . ' +' . mt_rand(0, 20) . ' days'))) : null,
            'thank_you_note' => $won ? 'Thank you for the wonderful referral!' : null,
            'is_disputed' => $i === 7 ? 1 : 0, 'dispute_reason' => $i === 7 ? 'Value seems overstated' : null, 'disputed_by' => $i === 7 ? $r : null,
            'created_at' => $date . ' 10:00:00', 'updated_at' => date('Y-m-d H:i:s', strtotime($date . ' +' . mt_rand(0, 5) . ' days 12:00')),
        ));
        q('UPDATE referrals SET code = ? WHERE id = ?', array(sprintf('BBA-R-%06d', $id), $id));
        insert('referral_events', array('referral_id' => $id, 'member_id' => $direct ? $r : $g, 'kind' => 'created', 'created_at' => $date . ' 10:00:00'));
        if (!$direct && $st !== 'new') {
            insert('referral_events', array('referral_id' => $id, 'member_id' => $r, 'kind' => 'status', 'from_status' => 'new', 'to_status' => $won ? 'won' : $st, 'created_at' => $date . ' 15:00:00'));
        }
    }
    $oneSt = array('completed', 'completed', 'completed', 'scheduled', 'requested', 'awaiting_confirmation', 'declined');
    for ($i = 0; $i < 40; $i++) {
        $a = $pick();
        $b = $pick($a);
        $st = $oneSt[mt_rand(0, count($oneSt) - 1)];
        $future = in_array($st, array('scheduled', 'requested'), true) && $i % 2 === 0;
        $at = $future ? date('Y-m-d H:i:00', strtotime('+' . mt_rand(1, 14) . ' days 11:00')) : date('Y-m-d H:i:00', strtotime('-' . mt_rand(1, 170) . ' days 16:30'));
        $id = insert('one_to_ones', array('requester_id' => $a, 'partner_id' => $b, 'meeting_at' => $at, 'mode' => $i % 3 ? 'in_person' : 'online', 'status' => $st,
            'proposed_by' => $a, 'logged_by' => in_array($st, array('completed', 'awaiting_confirmation'), true) ? $a : null,
            'business_discussed' => 'Discussed ideal clients for each business.', 'confirmed_at' => $st === 'completed' ? $at : null, 'created_at' => $at, 'updated_at' => $at));
        q('UPDATE one_to_ones SET code = ? WHERE id = ?', array(sprintf('BBA-M-%06d', $id), $id));
    }
    $meetingIds = array();
    for ($i = 0; $i < 6; $i++) {
        $d = date('Y-m-d', strtotime(($i < 4 ? '-' . (($i + 1) * 14) : '+' . (($i - 3) * 7)) . ' days'));
        $mid = insert('meetings', array('title' => 'Weekly chapter meeting', 'meeting_date' => $d, 'start_time' => '08:00', 'venue' => 'Burhani Hall, Camp, Pune'));
        $meetingIds[] = $mid;
        if ($i < 4) {
            foreach ($approved as $mem) {
                $roll = mt_rand(1, 10);
                insert('attendance', array('meeting_id' => $mid, 'member_id' => $mem, 'status' => $roll <= 8 ? 'present' : ($roll === 9 ? 'absent' : 'excused')));
            }
        }
    }
    $vn = array('Imran Patel', 'Sarah Khan', 'Rohit Shah', 'Aamir Sheikh', 'Neha Jain', 'Karan Mehta', 'Farah Ali', 'Vikram Rao', 'Zoya Merchant', 'Arjun Desai');
    $vs = array('invited', 'invited', 'attended', 'joined', 'not_interested');
    for ($i = 0; $i < 20; $i++) {
        $d = date('Y-m-d', strtotime('-' . mt_rand(0, 120) . ' days'));
        $id = insert('visitors', array('invited_by' => $pick(), 'name' => $vn[$i % 10], 'mobile' => '96' . mt_rand(10000000, 99999999), 'business' => $clients[$i % 10],
            'meeting_id' => $meetingIds[mt_rand(0, 5)], 'invited_date' => $d, 'status' => $vs[mt_rand(0, 4)], 'created_at' => $d . ' 09:00:00'));
        q('UPDATE visitors SET code = ? WHERE id = ?', array(sprintf('BBA-V-%06d', $id), $id));
    }
    for ($i = 0; $i < 12; $i++) {
        $a = $pick();
        $s = $pick($a);
        if (!one('SELECT id FROM testimonials WHERE author_id = ? AND subject_id = ?', array($a, $s))) {
            insert('testimonials', array('author_id' => $a, 'subject_id' => $s, 'body' => 'Professional, prompt and genuinely helpful. Highly recommended to every BBA member.'));
        }
    }
}
echo 'Seeded. Members: ' . val('SELECT COUNT(*) FROM members') . ', referrals: ' . val('SELECT COUNT(*) FROM referrals') . "\n";
