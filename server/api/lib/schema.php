<?php
/**
 * Schema + migrations. Written once in a portable dialect and adapted for the
 * configured driver (SQLite by default, MySQL 5.7 / MariaDB 10.3 supported).
 * Migrations run automatically on the first request after a deploy and are
 * recorded in settings.migrations, so each one runs exactly once.
 */

function schema_version()
{
    return 7;
}

function ddl($sql)
{
    if (is_mysql()) {
        $sql = str_replace('{ID}', 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', $sql);
        $sql = str_replace('{FK}', 'INT UNSIGNED', $sql);
        $sql = str_replace('{OPTS}', ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', $sql);
    } else {
        $sql = str_replace('{ID}', 'INTEGER PRIMARY KEY AUTOINCREMENT', $sql);
        $sql = str_replace('{FK}', 'INTEGER', $sql);
        $sql = str_replace('{OPTS}', '', $sql);
    }
    db()->exec($sql);
}

function ensure_installed()
{
    $flag = PRIVATE_DIR . '/data/.schema-v' . schema_version();
    if (is_file($flag)) {
        return;
    }
    run_migrations();
    @file_put_contents($flag, now());
}

function applied_migrations()
{
    try {
        $v = val("SELECT value FROM settings WHERE name = 'migrations'");
    } catch (Exception $e) {
        return array();
    }
    return $v ? explode(',', $v) : array();
}

function run_migrations()
{
    $dataDir = PRIVATE_DIR . '/data';
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
    $lock = fopen($dataDir . '/.migrate.lock', 'c');
    if ($lock) {
        flock($lock, LOCK_EX);
    }
    $done = applied_migrations();
    $list = array('m001_base', 'm002_seed', 'm003_landing_copy', 'm004_invites', 'm005_instagram_feed', 'm006_one_photos', 'm007_attendance_substitute');
    foreach ($list as $m) {
        if (in_array($m, $done, true)) {
            continue;
        }
        call_user_func($m);
        $done[] = $m;
        setting_set('migrations', implode(',', $done));
    }
    ensure_first_admin();
    if ($lock) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function m001_base()
{
    ddl('CREATE TABLE IF NOT EXISTS settings (
        name VARCHAR(64) NOT NULL PRIMARY KEY,
        value TEXT
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS categories (
        id {ID},
        name VARCHAR(120) NOT NULL UNIQUE,
        is_archived TINYINT NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS members (
        id {ID},
        role VARCHAR(16) NOT NULL DEFAULT \'member\',
        status VARCHAR(20) NOT NULL DEFAULT \'pending_review\',
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        mobile VARCHAR(15) NOT NULL UNIQUE,
        its_number VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        session_version INT NOT NULL DEFAULT 1,
        must_change_password TINYINT NOT NULL DEFAULT 0,
        photo_path VARCHAR(190) NULL,
        business_name VARCHAR(150) NOT NULL DEFAULT \'\',
        category_id {FK} NULL,
        category_other VARCHAR(120) NULL,
        designation VARCHAR(120) NOT NULL DEFAULT \'\',
        business_description TEXT NULL,
        address TEXT NULL,
        city VARCHAR(80) NOT NULL DEFAULT \'\',
        website VARCHAR(255) NULL,
        instagram VARCHAR(255) NULL,
        linkedin VARCHAR(255) NULL,
        facebook VARCHAR(255) NULL,
        offers TEXT NULL,
        looking_for TEXT NULL,
        referred_by_text VARCHAR(150) NULL,
        email_verified_at DATETIME NULL,
        approved_at DATETIME NULL,
        approved_by {FK} NULL,
        rejection_reason TEXT NULL,
        last_login_at DATETIME NULL,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS meetings (
        id {ID},
        title VARCHAR(150) NOT NULL,
        meeting_date DATE NOT NULL,
        start_time VARCHAR(5) NOT NULL,
        venue VARCHAR(255) NULL,
        online_link VARCHAR(255) NULL,
        notes TEXT NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS referrals (
        id {ID},
        code VARCHAR(20) NULL UNIQUE,
        type VARCHAR(10) NOT NULL DEFAULT \'referral\',
        giver_id {FK} NOT NULL,
        receiver_id {FK} NOT NULL,
        created_by {FK} NOT NULL,
        client_name VARCHAR(150) NOT NULL DEFAULT \'\',
        client_phone VARCHAR(20) NULL,
        client_email VARCHAR(190) NULL,
        requirement VARCHAR(255) NOT NULL,
        description TEXT NULL,
        estimated_value DECIMAL(14,2) NULL,
        referral_date DATE NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT \'new\',
        final_value DECIMAL(14,2) NULL,
        won_date DATE NULL,
        thank_you_note TEXT NULL,
        lost_reason VARCHAR(255) NULL,
        proof_path VARCHAR(190) NULL,
        is_disputed TINYINT NOT NULL DEFAULT 0,
        dispute_reason VARCHAR(255) NULL,
        disputed_by {FK} NULL,
        is_void TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (giver_id) REFERENCES members(id),
        FOREIGN KEY (receiver_id) REFERENCES members(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS referral_events (
        id {ID},
        referral_id {FK} NOT NULL,
        member_id {FK} NOT NULL,
        kind VARCHAR(10) NOT NULL,
        from_status VARCHAR(16) NULL,
        to_status VARCHAR(16) NULL,
        body TEXT NULL,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (referral_id) REFERENCES referrals(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS followups (
        id {ID},
        referral_id {FK} NOT NULL,
        member_id {FK} NOT NULL,
        due_date DATE NOT NULL,
        done TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME, updated_at DATETIME,
        UNIQUE (referral_id, member_id),
        FOREIGN KEY (referral_id) REFERENCES referrals(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS one_to_ones (
        id {ID},
        code VARCHAR(20) NULL UNIQUE,
        requester_id {FK} NOT NULL,
        partner_id {FK} NOT NULL,
        meeting_at DATETIME NOT NULL,
        mode VARCHAR(10) NOT NULL DEFAULT \'in_person\',
        status VARCHAR(24) NOT NULL,
        proposed_by {FK} NULL,
        logged_by {FK} NULL,
        request_message TEXT NULL,
        business_discussed TEXT NULL,
        products_introduced TEXT NULL,
        referrals_exchanged TEXT NULL,
        follow_up_actions TEXT NULL,
        requester_notes TEXT NULL,
        partner_notes TEXT NULL,
        confirmed_at DATETIME NULL,
        force_confirmed_by {FK} NULL,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (requester_id) REFERENCES members(id),
        FOREIGN KEY (partner_id) REFERENCES members(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS visitors (
        id {ID},
        code VARCHAR(20) NULL UNIQUE,
        invited_by {FK} NOT NULL,
        name VARCHAR(120) NOT NULL,
        mobile VARCHAR(15) NOT NULL,
        business VARCHAR(150) NULL,
        category VARCHAR(120) NULL,
        meeting_id {FK} NULL,
        invited_date DATE NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT \'invited\',
        joined_member_id {FK} NULL,
        notes TEXT NULL,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (invited_by) REFERENCES members(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS attendance (
        id {ID},
        meeting_id {FK} NOT NULL,
        member_id {FK} NOT NULL,
        status VARCHAR(10) NOT NULL,
        created_at DATETIME, updated_at DATETIME,
        UNIQUE (meeting_id, member_id),
        FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS testimonials (
        id {ID},
        author_id {FK} NOT NULL,
        subject_id {FK} NOT NULL,
        body TEXT NOT NULL,
        is_visible TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME, updated_at DATETIME,
        UNIQUE (author_id, subject_id)
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS notifications (
        id {ID},
        member_id {FK} NOT NULL,
        type VARCHAR(40) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NULL,
        link VARCHAR(255) NULL,
        read_at DATETIME NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS otp_codes (
        id {ID},
        email VARCHAR(190) NOT NULL,
        purpose VARCHAR(10) NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        used_at DATETIME NULL,
        ip VARCHAR(45) NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS pending_applications (
        id {ID},
        email VARCHAR(190) NOT NULL,
        payload_json MEDIUMTEXT NOT NULL,
        photo_tmp_path VARCHAR(190) NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS login_attempts (
        id {ID},
        identifier VARCHAR(190) NOT NULL,
        ip VARCHAR(45) NULL,
        success TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS member_flags (
        member_id {FK} NOT NULL PRIMARY KEY,
        last_followup_check DATE NULL,
        last_summary_month VARCHAR(7) NULL
    ){OPTS}');

    ddl('CREATE TABLE IF NOT EXISTS audit_logs (
        id {ID},
        actor_id {FK} NULL,
        action VARCHAR(60) NOT NULL,
        entity VARCHAR(40) NOT NULL,
        entity_id {FK} NULL,
        before_json MEDIUMTEXT NULL,
        after_json MEDIUMTEXT NULL,
        ip VARCHAR(45) NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');

    $indexes = array(
        'members' => array('status', 'category_id', 'city', 'full_name', 'business_name'),
        'referrals' => array('giver_id, referral_date', 'receiver_id, referral_date', 'status, won_date'),
        'referral_events' => array('referral_id'),
        'followups' => array('member_id, due_date, done'),
        'one_to_ones' => array('requester_id, meeting_at', 'partner_id, meeting_at', 'status'),
        'visitors' => array('invited_by, invited_date', 'mobile'),
        'notifications' => array('member_id, read_at'),
        'otp_codes' => array('email, purpose'),
        'login_attempts' => array('identifier, created_at'),
        'audit_logs' => array('entity, entity_id', 'created_at'),
    );
    foreach ($indexes as $table => $list) {
        foreach ($list as $cols) {
            $name = 'idx_' . $table . '_' . preg_replace('/[^a-z_]/', '', str_replace(', ', '_', $cols));
            try {
                db()->exec('CREATE INDEX ' . $name . ' ON ' . $table . ' (' . $cols . ')');
            } catch (Exception $e) {
                // index already exists — fine on re-run
            }
        }
    }
}

function m002_seed()
{
    $cats = array(
        'Architecture & Interiors', 'Construction', 'Real Estate', 'Retail', 'Textiles & Garments',
        'Food & Catering', 'Travel', 'Finance & Insurance', 'IT & Software', 'Healthcare', 'Education',
        'Manufacturing', 'Trading', 'Automobile', 'Events', 'Photography & Media', 'Legal & CA', 'Other',
    );
    foreach ($cats as $i => $c) {
        if (!one('SELECT id FROM categories WHERE name = ?', array($c))) {
            insert('categories', array('name' => $c, 'sort_order' => ($i + 1) * 10));
        }
    }
    $defaults = array(
        'target_121s' => '4',
        'target_referrals' => '2',
        'hero_sub' => 'Business owners in BBA send each other work, and keep a shared record of it.',
        'about' => 'Burhani Business Association (BBA) brings business owners from the community together every week. Members pass each other qualified referrals, meet one-to-one to understand each other\'s work, and track the business they create for one another — so trust turns into measurable growth.',
        'contact_email' => 'info@bbanetworking.com',
        'contact_phone' => '',
        'contact_address' => 'Pune, Maharashtra',
    );
    foreach ($defaults as $k => $v) {
        if (setting($k) === null) {
            setting_set($k, $v);
        }
    }
}

/** Replace the first-draft landing copy, but only where an admin has not edited it. */
function m003_landing_copy()
{
    $old = array(
        'hero_sub' => 'A trusted circle of entrepreneurs who grow together — through referrals, one-to-one meetings and genuine relationships.',
        'about' => 'Burhani Business Association (BBA) brings business owners from the community together every week. Members pass each other qualified referrals, meet one-to-one to understand each other\'s work, and track the business they create for one another — so trust turns into measurable growth.',
    );
    $new = array(
        'hero_sub' => 'Business owners in BBA send each other work, and keep a shared record of it.',
        'about' => 'Most good clients come through someone you trust. BBA makes that deliberate: you get to know other owners at meetings and over one-to-one conversations, pass along leads when you hear of them, and see what that trust adds up to.',
    );
    foreach ($new as $k => $v) {
        $cur = setting($k);
        if ($cur === null || $cur === $old[$k]) {
            setting_set($k, $v);
        }
    }
}

/** Admin-sent invite links, and the landing page's Instagram settings. */
function m004_invites()
{
    ddl('CREATE TABLE IF NOT EXISTS invites (
        id {ID},
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(190) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        mobile VARCHAR(15) NULL,
        role VARCHAR(16) NOT NULL DEFAULT \'member\',
        invited_by {FK} NULL,
        expires_at DATETIME NOT NULL,
        last_sent_at DATETIME NULL,
        accepted_at DATETIME NULL,
        member_id {FK} NULL,
        revoked_at DATETIME NULL,
        created_at DATETIME, updated_at DATETIME
    ){OPTS}');
    try {
        db()->exec('CREATE INDEX idx_invites_email ON invites (email)');
    } catch (Exception $e) {
        // already exists
    }
    foreach (array('instagram_handle' => '', 'instagram_feed_url' => '') as $k => $v) {
        if (setting($k) === null) {
            setting_set($k, $v);
        }
    }
}

/** BBA's own Instagram (@bbaofficial53) via its Behold feed, unless an admin already set something. */
function m005_instagram_feed()
{
    $defaults = array(
        'instagram_handle' => 'bbaofficial53',
        'instagram_feed_url' => 'https://feeds.behold.so/c7XYg8k8kjDPbu038Krs',
    );
    foreach ($defaults as $k => $v) {
        if ((string) setting($k, '') === '') {
            setting_set($k, $v);
        }
    }
}

/** Photos attached to a 121 (stored privately, visible to the two members and admins). */
function m006_one_photos()
{
    ddl('CREATE TABLE IF NOT EXISTS one_photos (
        id {ID},
        one_id {FK} NOT NULL,
        uploaded_by {FK} NOT NULL,
        path VARCHAR(64) NOT NULL,
        created_at DATETIME, updated_at DATETIME,
        FOREIGN KEY (one_id) REFERENCES one_to_ones(id)
    ){OPTS}');
    try {
        db()->exec('CREATE INDEX idx_one_photos_one_id ON one_photos (one_id)');
    } catch (Exception $e) {
        // already exists
    }
}

/** Attendance "E" (excused) became "S" (substitute). */
function m007_attendance_substitute()
{
    q("UPDATE attendance SET status = 'substitute' WHERE status = 'excused'");
}

function ensure_first_admin()
{
    $email = strtolower(trim((string) config('ADMIN_EMAIL', '')));
    if ($email === '' || val("SELECT COUNT(*) FROM members WHERE role = 'admin'") > 0) {
        return;
    }
    if (one('SELECT id FROM members WHERE email = ?', array($email))) {
        q("UPDATE members SET role = 'admin', status = 'approved' WHERE email = ?", array($email));
        return;
    }
    insert('members', array(
        'role' => 'admin',
        'status' => 'approved',
        'full_name' => config('ADMIN_NAME', 'BBA Admin'),
        'email' => $email,
        'mobile' => normalize_mobile(config('ADMIN_MOBILE', '9000000000')),
        'its_number' => (string) config('ADMIN_ITS', '00000000'),
        'password_hash' => password_hash(config('ADMIN_TEMP_PASSWORD', rand_hex(8)), PASSWORD_DEFAULT),
        'must_change_password' => 1,
        'business_name' => 'BBA Committee',
        'designation' => 'Administrator',
        'city' => 'Pune',
        'email_verified_at' => now(),
        'approved_at' => now(),
    ));
}
