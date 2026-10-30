<?php
/**
 * File uploads: avatars (public, images only) and proofs (private, images + PDF).
 * MIME is checked with finfo, never trusted from the client; filenames are random.
 */

function upload_from($field, $allowed, $destDir, $maxBytes = 5242880)
{
    if (empty($_FILES[$field]) || !is_array($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $f = $_FILES[$field];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        fail('upload', 'The file could not be uploaded. Try a smaller file.', 422, array($field => 'Upload failed.'));
    }
    if ($f['size'] > $maxBytes) {
        fail('upload', 'The file is too large (max 5 MB).', 422, array($field => 'Max 5 MB.'));
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($f['tmp_name']);
    if (!isset($allowed[$mime])) {
        fail('upload', 'That file type is not allowed.', 422, array($field => 'Use a JPG, PNG, WebP' . (isset($allowed['application/pdf']) ? ' or PDF' : '') . ' file.'));
    }
    if (!is_dir($destDir)) {
        mkdir($destDir, 0755, true);
    }
    $name = rand_hex(16) . '.' . $allowed[$mime];
    if (!move_uploaded_file($f['tmp_name'], $destDir . '/' . $name)) {
        fail('upload', 'The file could not be saved.', 500);
    }
    return $name;
}

function image_types()
{
    return array('image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png');
}

function public_root()
{
    return dirname(API_ROOT);
}

/** Save an avatar straight into the public folder. Returns the relative path. */
function save_avatar($field)
{
    $name = upload_from($field, image_types(), public_root() . '/uploads/avatars');
    return $name ? 'uploads/avatars/' . $name : null;
}

/** Hold a join photo privately until the email is verified. Returns the tmp filename. */
function save_tmp_photo($field)
{
    return upload_from($field, image_types(), PRIVATE_DIR . '/uploads/tmp');
}

function promote_tmp_photo($tmpName)
{
    if (!$tmpName || !preg_match('/^[a-f0-9]{32}\.(webp|jpg|png)$/', $tmpName)) {
        return null;
    }
    $src = PRIVATE_DIR . '/uploads/tmp/' . $tmpName;
    if (!is_file($src)) {
        return null;
    }
    $dir = public_root() . '/uploads/avatars';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    rename($src, $dir . '/' . $tmpName);
    return 'uploads/avatars/' . $tmpName;
}

function delete_avatar($path)
{
    if ($path && preg_match('#^uploads/avatars/[a-f0-9]{32}\.(webp|jpg|png)$#', $path)) {
        @unlink(public_root() . '/' . $path);
    }
}

/** 121 photos are private: served only through files/121-photo after an access check. */
function save_one_photo($field)
{
    return upload_from($field, image_types(), PRIVATE_DIR . '/uploads/121');
}

function save_proof($field)
{
    $types = image_types();
    $types['application/pdf'] = 'pdf';
    return upload_from($field, $types, PRIVATE_DIR . '/uploads/proofs');
}
