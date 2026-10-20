<?php
// Exam Studio – AI tutor proxy for Google Gemini.
// The API key stays on the server (api/.env). The browser never sees it.
// One call = one attempt at Gemini. The browser retries (up to 20×, every 10 s) when "retry" is true,
// so a slow or overloaded Gemini never runs into the host's PHP time limit.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }

function env_config(): array {
    $cfg = [];
    foreach ([__DIR__ . '/.env', dirname(__DIR__, 2) . '/.env-studioexam'] as $f) {
        if (!is_readable($f)) continue;
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
            [$k, $v] = array_map('trim', explode('=', $line, 2));
            $cfg[$k] = trim($v, "\"'");
        }
        break;
    }
    return $cfg;
}

$cfg = env_config();
$key = $cfg['GEMINI_API_KEY'] ?? '';
$model = preg_replace('/[^a-zA-Z0-9._-]/', '', $cfg['GEMINI_MODEL'] ?? 'gemini-2.5-flash');
$configured = $key !== '' && $key !== 'PASTE_YOUR_KEY_HERE';

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(200, ['ok' => true, 'configured' => $configured, 'model' => $model]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['error' => 'POST only', 'retry' => false]);
if (!$configured) out(500, ['error' => 'The AI tutor is not configured: add GEMINI_API_KEY to api/.env on the server.', 'retry' => false]);

// Only accept calls from pages on this site.
$host = $_SERVER['HTTP_HOST'] ?? '';
$from = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($from !== '' && parse_url($from, PHP_URL_HOST) !== parse_url('//' . $host, PHP_URL_HOST)) out(403, ['error' => 'Requests from other sites are not allowed.', 'retry' => false]);

// Simple abuse limits (per IP and per day), stored in files next to this script.
$dir = __DIR__ . '/_limits';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$perIp = (int)($cfg['MAX_REQUESTS_PER_IP_PER_HOUR'] ?? 120);
$perDay = (int)($cfg['MAX_REQUESTS_PER_DAY'] ?? 3000);
$ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'x') . date('YmdH'));
$ipFile = "$dir/ip-$ip";
$dayFile = "$dir/day-" . date('Ymd');
$nIp = (int)@file_get_contents($ipFile);
$nDay = (int)@file_get_contents($dayFile);
if ($nIp >= $perIp) out(429, ['error' => 'Too many tutor requests from your connection this hour. Try again later.', 'retry' => false]);
if ($nDay >= $perDay) out(429, ['error' => 'The tutor has reached today\'s request limit. Try again tomorrow.', 'retry' => false]);
@file_put_contents($ipFile, (string)($nIp + 1), LOCK_EX);
@file_put_contents($dayFile, (string)($nDay + 1), LOCK_EX);
foreach (glob("$dir/*") ?: [] as $f) if (filemtime($f) < time() - 2 * 86400) @unlink($f);

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 60000) out(413, ['error' => 'Message too long.', 'retry' => false]);
$in = json_decode($raw, true);
if (!is_array($in) || empty($in['messages']) || !is_array($in['messages'])) out(400, ['error' => 'Bad request.', 'retry' => false]);

$system = (string)($in['system'] ?? '');
$contents = [];
foreach (array_slice($in['messages'], -16) as $m) {
    $role = ($m['role'] ?? '') === 'model' ? 'model' : 'user';
    $text = mb_substr((string)($m['text'] ?? ''), 0, 12000);
    if ($text === '') continue;
    $contents[] = ['role' => $role, 'parts' => [['text' => $text]]];
}
if (!$contents) out(400, ['error' => 'Empty message.', 'retry' => false]);

$payload = [
    'contents' => $contents,
    'generationConfig' => ['temperature' => 0.3, 'maxOutputTokens' => 4096],
];
if ($system !== '') $payload['systemInstruction'] = ['parts' => [['text' => mb_substr($system, 0, 30000)]]];

$apiBase = rtrim($cfg['GEMINI_API_BASE'] ?? 'https://generativelanguage.googleapis.com', '/');
$url = $apiBase . '/v1beta/models/' . $model . ':generateContent';
$timeout = (int)($cfg['GEMINI_TIMEOUT_SECONDS'] ?? 25);
$body = json_encode($payload, JSON_UNESCAPED_UNICODE);
$status = 0; $resp = false; $err = '';
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $key],
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10]);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
} else {
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\nx-goog-api-key: $key\r\n", 'content' => $body, 'timeout' => $timeout, 'ignore_errors' => true]]);
    $resp = @file_get_contents($url, false, $ctx);
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $mm)) $status = (int)$mm[1];
}

if ($resp === false || $status === 0) out(502, ['error' => 'Gemini did not answer (' . ($err ?: 'timeout/network') . ').', 'retry' => true]);
$j = json_decode($resp, true);
if ($status !== 200) {
    $msg = $j['error']['message'] ?? ('HTTP ' . $status);
    // 400/401/403/404 = wrong key, model name or request: retrying cannot help.
    $retry = !in_array($status, [400, 401, 403, 404], true);
    out($retry ? 503 : 500, ['error' => 'Gemini error ' . $status . ': ' . $msg, 'retry' => $retry]);
}
$cand = $j['candidates'][0] ?? null;
$text = '';
foreach (($cand['content']['parts'] ?? []) as $p) if (empty($p['thought'])) $text .= $p['text'] ?? '';
$finish = $cand['finishReason'] ?? '';
if (trim($text) === '') out(503, ['error' => 'Gemini returned an empty answer' . ($finish ? " ($finish)" : '') . '.', 'retry' => true]);
out(200, ['text' => $text, 'truncated' => $finish === 'MAX_TOKENS', 'model' => $model]);
