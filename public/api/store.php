<?php
/**
 * Shared household store for Wochenkochen / Wochenmahl.
 * SQLite file lives in api/data/ (not web-accessible via .htaccess).
 *
 * Browser → this PHP → wochenmahl.sqlite
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const HOUSEHOLD_ID = 'default';

function respond(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dir = __DIR__ . '/data';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        respond(500, ['ok' => false, 'message' => 'data/-Ordner konnte nicht angelegt werden.']);
    }

    $path = $dir . '/wochenmahl.sqlite';
    try {
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $e) {
        respond(500, [
            'ok' => false,
            'message' => 'SQLite nicht verfügbar (PDO_SQLITE). ' . $e->getMessage(),
        ]);
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS household (
            id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            payload TEXT NOT NULL
        )'
    );

    return $pdo;
}

function load_row(PDO $pdo): ?array {
    $stmt = $pdo->prepare('SELECT revision, updated_at, payload FROM household WHERE id = ?');
    $stmt->execute([HOUSEHOLD_ID]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function decode_payload(?string $raw): ?array {
    if ($raw === null || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

if ($method === 'GET') {
    $row = load_row($pdo);
    if (!$row) {
        respond(200, [
            'ok' => true,
            'empty' => true,
            'revision' => 0,
            'updatedAt' => null,
            'state' => null,
            'engine' => 'sqlite',
        ]);
    }
    respond(200, [
        'ok' => true,
        'empty' => false,
        'revision' => (int) $row['revision'],
        'updatedAt' => $row['updated_at'],
        'state' => decode_payload($row['payload']),
        'engine' => 'sqlite',
    ]);
}

if ($method !== 'POST') {
    respond(405, ['ok' => false, 'message' => 'Nur GET/POST.']);
}

$input = read_json();
$action = (string) ($input['action'] ?? 'save');

if ($action === 'ping') {
    respond(200, [
        'ok' => true,
        'engine' => 'sqlite',
        'message' => 'SQLite-Store bereit.',
    ]);
}

if ($action !== 'save') {
    respond(400, ['ok' => false, 'message' => 'Unbekannte action.']);
}

$state = $input['state'] ?? null;
if (!is_array($state)) {
    respond(400, ['ok' => false, 'message' => 'state fehlt oder ist ungültig.']);
}

// Never persist who is logged in on a device — only shared household data.
unset($state['currentUser']);

$clientRevision = isset($input['revision']) ? (int) $input['revision'] : null;
$row = load_row($pdo);
$serverRevision = $row ? (int) $row['revision'] : 0;

if ($row && $clientRevision !== null && $clientRevision !== $serverRevision) {
    respond(409, [
        'ok' => false,
        'conflict' => true,
        'message' => 'Neuerer Stand auf dem Server — lokal aktualisiert.',
        'revision' => $serverRevision,
        'updatedAt' => $row['updated_at'],
        'state' => decode_payload($row['payload']),
        'engine' => 'sqlite',
    ]);
}

$nextRevision = $serverRevision + 1;
$updatedAt = gmdate('c');
$payload = json_encode($state, JSON_UNESCAPED_UNICODE);
if ($payload === false) {
    respond(500, ['ok' => false, 'message' => 'JSON encode fehlgeschlagen.']);
}

$stmt = $pdo->prepare(
    'INSERT INTO household (id, revision, updated_at, payload)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       revision = excluded.revision,
       updated_at = excluded.updated_at,
       payload = excluded.payload'
);
$stmt->execute([HOUSEHOLD_ID, $nextRevision, $updatedAt, $payload]);

respond(200, [
    'ok' => true,
    'revision' => $nextRevision,
    'updatedAt' => $updatedAt,
    'engine' => 'sqlite',
]);
