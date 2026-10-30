<?php
// Copy to config.secrets.php (never commit it) and fill in the values.
return array(
    'APP_URL' => 'https://dashboard.bbanetworking.com',
    'CORS_ORIGINS' => array('https://bbanetworking.com', 'https://www.bbanetworking.com', 'http://bbanetworking.com', 'http://www.bbanetworking.com'),

    // Database: 'sqlite' (zero setup, file in _private/data) or 'mysql'.
    'DB_DRIVER' => 'sqlite',
    'DB_HOST' => 'localhost',
    'DB_NAME' => '',
    'DB_USER' => '',
    'DB_PASS' => '',

    // Email: 'resend' (recommended: set RESEND_API_KEY and verify bbanetworking.com in Resend),
    // 'smtp' (Gmail App Password), 'mail' (PHP mail()), or 'log' (dev only).
    // With 'resend', MAIL_FROM must be an address on the verified domain, e.g. no-reply@bbanetworking.com.
    'RESEND_API_KEY' => '',
    'MAIL_DRIVER' => 'resend',
    'SMTP_HOST' => 'smtp.gmail.com',
    'SMTP_PORT' => 587,
    'SMTP_USER' => 'bba.network.app@gmail.com',
    'SMTP_PASS' => 'xxxx xxxx xxxx xxxx',
    'MAIL_FROM' => 'no-reply@bbanetworking.com',

    // First admin — created automatically on the first request, forced to change password.
    'ADMIN_EMAIL' => 'admin@example.com',
    'ADMIN_NAME' => 'BBA Admin',
    'ADMIN_MOBILE' => '9000000000',
    'ADMIN_ITS' => '00000000',
    'ADMIN_TEMP_PASSWORD' => 'change-me-now',

    // Never true in production: also writes OTP codes to _private/logs/otp.log.
    'DEV_SHOW_OTP' => false,
);
