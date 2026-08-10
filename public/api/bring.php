<?php
/**
 * Bring! proxy for Wochenkochen (webspace / Wavespace).
 * Browser → this PHP → api.getbring.com (avoids CORS).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

const BRING_API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp';
const BRING_BASE = 'https://api.getbring.com/rest/v2/';

function read_json(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function respond(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function bring_headers(array $extra = []): array {
    $headers = array_merge([
        'X-BRING-API-KEY: ' . BRING_API_KEY,
        'X-BRING-CLIENT: webApp',
        'X-BRING-CLIENT-SOURCE: webApp',
        'X-BRING-COUNTRY: DE',
        'X-BRING-APPLICATION: bring',
    ], $extra);
    return $headers;
}

function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false) {
        return ['ok' => false, 'status' => 0, 'error' => $error ?: 'curl failed', 'json' => null, 'raw' => ''];
    }
    $json = json_decode($response, true);
    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'error' => null,
        'json' => is_array($json) ? $json : null,
        'raw' => $response,
    ];
}

$input = read_json();
$action = $input['action'] ?? '';

if ($action === 'login') {
    $email = trim((string) ($input['email'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    if ($email === '' || $password === '') {
        respond(400, ['ok' => false, 'message' => 'E-Mail und Passwort erforderlich.']);
    }

    $res = http_request(
        'POST',
        BRING_BASE . 'bringauth',
        bring_headers(['Content-Type: application/x-www-form-urlencoded']),
        http_build_query(['email' => $email, 'password' => $password])
    );

    if (!$res['ok'] || !$res['json'] || isset($res['json']['error'])) {
        $msg = $res['json']['message'] ?? ($res['raw'] ?: 'Login fehlgeschlagen');
        respond(401, ['ok' => false, 'message' => is_string($msg) ? $msg : 'Login fehlgeschlagen']);
    }

    $auth = $res['json'];
    $uuid = $auth['uuid'] ?? '';
    $token = $auth['access_token'] ?? '';
    $name = $auth['name'] ?? '';

    $listsRes = http_request(
        'GET',
        BRING_BASE . 'bringusers/' . rawurlencode($uuid) . '/lists',
        bring_headers([
            'Authorization: Bearer ' . $token,
            'X-BRING-USER-UUID: ' . $uuid,
        ])
    );

    $lists = [];
    if ($listsRes['ok'] && isset($listsRes['json']['lists']) && is_array($listsRes['json']['lists'])) {
        foreach ($listsRes['json']['lists'] as $list) {
            $lists[] = [
                'listUuid' => $list['listUuid'] ?? '',
                'name' => $list['name'] ?? 'Liste',
            ];
        }
    }

    respond(200, [
        'ok' => true,
        'message' => 'Bring-Konto verknüpft' . ($name ? " ($name)" : ''),
        'uuid' => $uuid,
        'accessToken' => $token,
        'refreshToken' => $auth['refresh_token'] ?? '',
        'name' => $name,
        'lists' => $lists,
    ]);
}

if ($action === 'push') {
    $uuid = trim((string) ($input['uuid'] ?? ''));
    $token = trim((string) ($input['accessToken'] ?? ''));
    $listUuid = trim((string) ($input['listUuid'] ?? ''));
    $items = $input['items'] ?? [];
    if ($uuid === '' || $token === '' || $listUuid === '' || !is_array($items) || count($items) === 0) {
        respond(400, ['ok' => false, 'message' => 'Token, Liste und Artikel nötig.']);
    }

    $added = [];
    $failed = [];
    foreach ($items as $item) {
        $name = trim((string) ($item['name'] ?? ''));
        $spec = trim((string) ($item['amount'] ?? ($item['specification'] ?? '')));
        if ($name === '') {
            continue;
        }
        $body = http_build_query([
            'purchase' => $name,
            'recently' => '',
            'specification' => $spec,
            'remove' => '',
            'sender' => 'null',
        ]);
        // Legacy PUT expects leading &purchase=… style used by the apps.
        $legacyBody = '&purchase=' . rawurlencode($name)
            . '&recently=&specification=' . rawurlencode($spec)
            . '&remove=&sender=null';

        $res = http_request(
            'PUT',
            BRING_BASE . 'bringlists/' . rawurlencode($listUuid),
            bring_headers([
                'Authorization: Bearer ' . $token,
                'X-BRING-USER-UUID: ' . $uuid,
                'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            ]),
            $legacyBody
        );

        if ($res['ok'] || $res['status'] === 204 || $res['status'] === 200) {
            $added[] = $spec !== '' ? "$name ($spec)" : $name;
        } else {
            $failed[] = $name;
        }
    }

    if (count($added) === 0) {
        respond(502, [
            'ok' => false,
            'message' => 'Keine Artikel konnten zu Bring gesendet werden.',
            'failed' => $failed,
        ]);
    }

    respond(200, [
        'ok' => true,
        'message' => count($added) . ' Artikel an Bring gesendet'
            . (count($failed) ? ' (' . count($failed) . ' fehlgeschlagen)' : '') . '.',
        'added' => $added,
        'failed' => $failed,
    ]);
}

respond(400, ['ok' => false, 'message' => 'Unbekannte Aktion.']);
