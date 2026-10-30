<?php
/**
 * Transactional email. Driver is set in config:
 *   MAIL_DRIVER = 'resend' (Resend HTTP API, RESEND_API_KEY) | 'smtp' (any SMTP via PHPMailer)
 *               | 'mail' (PHP mail()) | 'log' (dev only: writes to _private/logs/mail.log).
 */

require_once API_ROOT . '/vendor/phpmailer/Exception.php';
require_once API_ROOT . '/vendor/phpmailer/PHPMailer.php';
require_once API_ROOT . '/vendor/phpmailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

/**
 * @return bool true on success
 */
function send_mail($to, $subject, $heading, $paragraphs, $button = null)
{
    $html = email_html($heading, $paragraphs, $button);
    $text = $heading . "\n\n" . implode("\n\n", array_map('strip_tags', $paragraphs));
    if ($button) {
        $text .= "\n\n" . $button['label'] . ': ' . $button['url'];
    }

    if (config('MAIL_DRIVER', 'mail') === 'log') {
        log_line('mail', 'TO ' . $to . ' | ' . $subject . ' | ' . $text);
        return true;
    }

    if (config('MAIL_DRIVER', 'mail') === 'resend') {
        return resend_send($to, $subject, $html, $text);
    }

    $mail = new PHPMailer(true);
    try {
        $mail->CharSet = 'UTF-8';
        if (config('MAIL_DRIVER', 'mail') === 'smtp') {
            $mail->isSMTP();
            $mail->Host = config('SMTP_HOST', 'smtp.gmail.com');
            $mail->Port = (int) config('SMTP_PORT', 587);
            $mail->SMTPAuth = true;
            $mail->Username = config('SMTP_USER');
            $mail->Password = config('SMTP_PASS');
            $mail->SMTPSecure = ((int) config('SMTP_PORT', 587) === 465) ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Timeout = 15;
        } else {
            $mail->isMail();
        }
        $from = config('MAIL_FROM', config('SMTP_USER', 'no-reply@bbanetworking.com'));
        $mail->setFrom($from, mail_from_name());
        $reply = setting('contact_email');
        if ($reply && filter_var($reply, FILTER_VALIDATE_EMAIL)) {
            $mail->addReplyTo($reply);
        }
        $mail->addAddress($to);
        $mail->Subject = $subject;
        $mail->isHTML(true);
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
        return true;
    } catch (Exception $e) {
        log_line('mail', 'FAILED to ' . $to . ': ' . $mail->ErrorInfo . ' ' . $e->getMessage());
        return false;
    }
}

function mail_from_name()
{
    return 'BBA — Burhani Business Association';
}

/** Send through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
function resend_send($to, $subject, $html, $text)
{
    $key = (string) config('RESEND_API_KEY', '');
    if ($key === '') {
        log_line('mail', 'FAILED to ' . $to . ': RESEND_API_KEY is not set');
        return false;
    }
    $payload = array(
        'from' => mail_from_name() . ' <' . config('MAIL_FROM', 'no-reply@bbanetworking.com') . '>',
        'to' => array($to),
        'subject' => $subject,
        'html' => $html,
        'text' => $text,
    );
    $reply = setting('contact_email');
    if ($reply && filter_var($reply, FILTER_VALIDATE_EMAIL)) {
        $payload['reply_to'] = $reply;
    }
    list($status, $body) = http_post_json('https://api.resend.com/emails', $payload, array('Authorization: Bearer ' . $key));
    if ($status >= 200 && $status < 300) {
        return true;
    }
    log_line('mail', 'FAILED to ' . $to . ': Resend HTTP ' . $status . ' ' . substr((string) $body, 0, 300));
    return false;
}

/** @return array [status, body]; status 0 when the request could not be made. */
function http_post_json($url, $payload, $headers = array())
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $headers = array_merge(array('Content-Type: application/json', 'Accept: application/json', 'User-Agent: BBA-Networking/1.0'), $headers);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 20,
        ));
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($body === false) {
            $body = curl_error($ch);
        }
        curl_close($ch);
        return array($status, $body);
    }
    $ctx = stream_context_create(array('http' => array(
        'method' => 'POST',
        'header' => implode("\r\n", $headers),
        'content' => $json,
        'timeout' => 20,
        'ignore_errors' => true,
    )));
    $body = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0] . ' ', $m)) {
        $status = (int) $m[1];
    }
    return array($status, $body === false ? 'request failed' : $body);
}

function log_line($channel, $msg)
{
    $dir = PRIVATE_DIR . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($dir . '/' . $channel . '.log', '[' . now() . '] ' . $msg . "\n", FILE_APPEND);
}

function e($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/** Paragraphs are plain text (escaped here) unless they start with "<raw>". */
function email_html($heading, $paragraphs, $button)
{
    $body = '';
    foreach ($paragraphs as $p) {
        if (strpos($p, '<raw>') === 0) {
            $body .= substr($p, 5);
        } else {
            $body .= '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1C1C1C">' . nl2br(e($p)) . '</p>';
        }
    }
    $btn = '';
    if ($button) {
        $btn = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="background:#E0A82E;border-radius:12px">'
            . '<a href="' . e($button['url']) . '" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#0B0B0B;text-decoration:none">'
            . e($button['label']) . '</a></td></tr></table>';
    }
    return '<!doctype html><html><body style="margin:0;padding:0;background:#FBF6EC;font-family:Helvetica,Arial,sans-serif">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6EC;padding:24px 12px"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E8E1D3">'
        . '<tr><td style="background:#0B0B0B;padding:24px 28px">'
        . '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        . '<td style="padding-right:14px"><img src="' . e(app_url('/logo-email.png')) . '" width="56" height="56" alt="BBA" style="display:block;border:0;border-radius:50%"></td>'
        . '<td><div style="font-size:17px;font-weight:700;color:#FFFFFF">Burhani Business Association</div>'
        . '<div style="margin-top:4px;font-size:11px;letter-spacing:2px;color:#F2CF6B;text-transform:uppercase">Network &bull; Trust &bull; Business</div></td>'
        . '</tr></table>'
        . '</td></tr>'
        . '<tr><td style="padding:28px">'
        . '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0B0B0B">' . e($heading) . '</h1>'
        . $body . $btn
        . '</td></tr>'
        . '<tr><td style="padding:16px 28px;background:#FFFDF8;border-top:1px solid #E8E1D3;font-size:12px;color:#8A8A8A">'
        . 'Burhani Business Association &middot; This is an automated message.'
        . '</td></tr></table></td></tr></table></body></html>';
}

function otp_block($code)
{
    return '<raw><div style="margin:8px 0 20px;padding:18px;background:#FBF6EC;border-radius:12px;text-align:center;font-size:32px;font-weight:800;letter-spacing:10px;color:#0B0B0B">'
        . e($code) . '</div>';
}
