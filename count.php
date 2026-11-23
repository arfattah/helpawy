<?php
// Anonymous download/install counter for Waraqa.
// Stores only totals per platform and per day. No IP address, cookie or file data is kept:
// a one-day salted hash is used to count each visitor once per day, then discarded.
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit; }
$allowed = ['win_download', 'mac_click', 'install_android', 'install_ios', 'install_windows', 'install_mac', 'install_other'];
$e = $_GET['e'] ?? '';
if (!is_string($e) || !in_array($e, $allowed, true)) { http_response_code(400); exit; }
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) { http_response_code(403); exit; }

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !mkdir($dir, 0700, true)) { http_response_code(500); exit; }
$fh = fopen($dir . '/counts.json', 'c+');
if ($fh === false || !flock($fh, LOCK_EX)) { http_response_code(500); exit; }
$raw = stream_get_contents($fh);
$data = json_decode($raw === false || $raw === '' ? '{}' : $raw, true);
if (!is_array($data)) { $data = []; }
$today = gmdate('Y-m-d');
if (!isset($data['salt']) || ($data['seen_date'] ?? '') !== $today) {
    $data['salt'] = bin2hex(random_bytes(16)); $data['seen_date'] = $today; $data['seen'] = [];
}
$key = substr(hash('sha256', $data['salt'] . '|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $e), 0, 16);
$counted = false;
if (!isset($data['seen'][$key]) && count($data['seen']) < 20000) {
    $data['seen'][$key] = 1;
    $data['total'][$e] = (int)($data['total'][$e] ?? 0) + 1;
    $data['days'][$today][$e] = (int)($data['days'][$today][$e] ?? 0) + 1;
    if (count($data['days']) > 120) { ksort($data['days']); $data['days'] = array_slice($data['days'], -120, null, true); }
    $data['updated'] = gmdate('c');
    $counted = true;
}
if ($counted) { rewind($fh); ftruncate($fh, 0); fwrite($fh, json_encode($data)); fflush($fh); }
flock($fh, LOCK_UN); fclose($fh);
http_response_code(204);
