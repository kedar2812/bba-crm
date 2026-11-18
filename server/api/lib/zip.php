<?php
/**
 * Minimal ZIP writer and reader in plain PHP (only zlib needed), so backups work
 * whether or not the host has the zip extension. Store + deflate, UTF-8 names,
 * no zip64 (a backup stays far below 4 GB and 65,535 files).
 */

class ZipOut
{
    /** @var resource */
    private $fh;
    /** @var array */
    private $central = array();
    /** @var int */
    private $offset = 0;

    public function __construct($path)
    {
        $fh = fopen($path, 'wb');
        if (!$fh) {
            throw new Exception('Cannot write ' . $path);
        }
        $this->fh = $fh;
    }

    /** Add a file. Already-compressed data (images, PDFs) is stored as-is. */
    public function add($name, $data, $compress = true)
    {
        $name = str_replace('\\', '/', $name);
        $crc = crc32($data);
        $size = strlen($data);
        $method = 0;
        $body = $data;
        if ($compress && $size > 0) {
            $deflated = gzdeflate($data, 6);
            if ($deflated !== false && strlen($deflated) < $size) {
                $method = 8;
                $body = $deflated;
            }
        }
        list($time, $date) = self::dosTime(time());
        $flags = 0x0800; // file names are UTF-8
        $header = pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, $method, $time, $date, $crc, strlen($body), $size, strlen($name), 0);
        $this->write($header . $name);
        $this->write($body);
        $this->central[] = pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, $flags, $method, $time, $date, $crc, strlen($body), $size, strlen($name), 0, 0, 0, 0, 0, $this->offset) . $name;
        $this->offset += strlen($header) + strlen($name) + strlen($body);
    }

    public function close()
    {
        $cd = implode('', $this->central);
        $this->write($cd);
        $n = count($this->central);
        $this->write(pack('VvvvvVVv', 0x06054b50, 0, 0, $n, $n, strlen($cd), $this->offset, 0));
        fclose($this->fh);
    }

    private function write($bytes)
    {
        if (fwrite($this->fh, $bytes) !== strlen($bytes)) {
            throw new Exception('Disk full or not writable while writing the backup.');
        }
    }

    private static function dosTime($ts)
    {
        $d = getdate($ts);
        $year = max(1980, $d['year']);
        return array(
            ($d['hours'] << 11) | ($d['minutes'] << 5) | (int) ($d['seconds'] / 2),
            (($year - 1980) << 9) | ($d['mon'] << 5) | $d['mday'],
        );
    }
}

class ZipIn
{
    /** @var resource */
    private $fh;
    /** @var array name => [method, crc, csize, usize, offset] */
    public $entries = array();

    /** @throws Exception with a message fit to show the admin */
    public function __construct($path)
    {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            throw new Exception('The uploaded file could not be opened.');
        }
        $this->fh = $fh;
        $size = filesize($path);
        if ($size < 22) {
            throw new Exception('This is not a ZIP file.');
        }
        $tail = min($size, 65557);
        fseek($fh, $size - $tail);
        $buf = fread($fh, $tail);
        $pos = strrpos($buf, "PK\x05\x06");
        if ($pos === false || strlen($buf) - $pos < 22) {
            throw new Exception('This is not a ZIP file, or it is damaged (the download may not have finished).');
        }
        $eocd = unpack('Vsig/vdisk/vcddisk/vdiskentries/ventries/Vcdsize/Vcdoffset', substr($buf, $pos, 20));
        if ($eocd['entries'] === 0xFFFF || $eocd['cdoffset'] === 0xFFFFFFFF) {
            throw new Exception('This ZIP uses the ZIP64 format, which is not supported. Upload the backup file exactly as it was downloaded.');
        }
        if ($eocd['cdoffset'] + $eocd['cdsize'] > $size) {
            throw new Exception('The ZIP file is damaged or incomplete.');
        }
        fseek($fh, $eocd['cdoffset']);
        $cd = $eocd['cdsize'] > 0 ? fread($fh, $eocd['cdsize']) : '';
        $p = 0;
        for ($i = 0; $i < $eocd['entries']; $i++) {
            if (strlen($cd) < $p + 46 || substr($cd, $p, 4) !== "PK\x01\x02") {
                throw new Exception('The ZIP file is damaged (bad directory).');
            }
            $h = unpack('vmade/vneed/vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vusize/vnlen/vxlen/vclen/vdisk/vint/Vext/Voffset', substr($cd, $p + 4, 42));
            $name = str_replace('\\', '/', substr($cd, $p + 46, $h['nlen']));
            $p += 46 + $h['nlen'] + $h['xlen'] + $h['clen'];
            if ($name === '' || substr($name, -1) === '/') {
                continue; // folder entry
            }
            if ($h['flags'] & 1) {
                throw new Exception('The ZIP file is password-protected. Upload the backup exactly as it was downloaded.');
            }
            $this->entries[$name] = array(
                'method' => $h['method'],
                'crc' => $h['crc'],
                'csize' => $h['csize'],
                'usize' => $h['usize'],
                'offset' => $h['offset'],
            );
        }
    }

    /** @throws Exception */
    public function read($name, $maxBytes)
    {
        if (!isset($this->entries[$name])) {
            throw new Exception('Missing file in backup: ' . $name);
        }
        $e = $this->entries[$name];
        if ($e['usize'] > $maxBytes) {
            throw new Exception('A file in the backup is larger than allowed: ' . $name);
        }
        fseek($this->fh, $e['offset']);
        $lh = fread($this->fh, 30);
        if (strlen($lh) !== 30 || substr($lh, 0, 4) !== "PK\x03\x04") {
            throw new Exception('The ZIP file is damaged: ' . $name);
        }
        $l = unpack('vnlen/vxlen', substr($lh, 26, 4));
        fseek($this->fh, $e['offset'] + 30 + $l['nlen'] + $l['xlen']);
        $raw = $e['csize'] > 0 ? fread($this->fh, $e['csize']) : '';
        if (strlen($raw) !== $e['csize']) {
            throw new Exception('The ZIP file is incomplete: ' . $name);
        }
        if ($e['method'] === 0) {
            $data = $raw;
        } elseif ($e['method'] === 8) {
            $data = $e['usize'] === 0 ? '' : @gzinflate($raw, $e['usize']);
            if ($data === false) {
                throw new Exception('The ZIP file is damaged: ' . $name);
            }
        } else {
            throw new Exception('Unsupported compression in ' . $name . '. Upload the backup exactly as it was downloaded.');
        }
        if (strlen($data) !== $e['usize'] || (crc32($data) & 0xFFFFFFFF) !== $e['crc']) {
            throw new Exception('The ZIP file is damaged (checksum mismatch): ' . $name);
        }
        return $data;
    }

    public function close()
    {
        if ($this->fh) {
            fclose($this->fh);
            $this->fh = null;
        }
    }
}
