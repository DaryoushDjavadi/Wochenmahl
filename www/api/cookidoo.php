<?php
/**
 * Cookidoo proxy for Wochenkochen (webspace / Wavespace).
 * Uses the mobile password-grant endpoints where still available,
 * then fetches recipe details / favorites into the weekly planner.
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

const COOKIDOO_AUTH = 'Basic a3VwZmVyd2Vyay1jbGllbnQtbndvdDpMczUwT04xd295U3FzMWRDZEpnZQ==';

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

function http_request(string $method, string $url, array $headers = [], ?string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 45,
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

function country_host(string $country): string {
    $country = strtolower($country);
    $map = [
        'de' => 'de',
        'at' => 'at',
        'ch' => 'ch',
        'ie' => 'ie',
        'gb' => 'ie',
        'uk' => 'ie',
        'intl' => 'xp',
        'xp' => 'xp',
    ];
    $cc = $map[$country] ?? 'de';
    return "https://{$cc}.tmmobile.vorwerk-digital.com";
}

function lang_for(string $country): string {
    $country = strtolower($country);
    return match ($country) {
        'ch' => 'de-CH',
        'at' => 'de-DE',
        'ie', 'gb', 'uk' => 'en-GB',
        default => 'de-DE',
    };
}

function parse_recipe_id(string $input): ?string {
    $input = trim($input);
    if (preg_match('/\b(r\d+)\b/i', $input, $m)) {
        return strtolower($m[1]);
    }
    if (preg_match('#/recipes/recipe/[^/]+/([^/?#]+)#', $input, $m)) {
        return $m[1];
    }
    return $input !== '' ? $input : null;
}

function normalize_ingredients(array $recipe): array {
    $out = [];
    $groups = $recipe['recipeIngredientGroups'] ?? $recipe['ingredientGroups'] ?? [];
    if (!is_array($groups)) {
        $groups = [];
    }
    foreach ($groups as $group) {
        $ings = $group['recipeIngredients'] ?? $group['ingredients'] ?? [];
        if (!is_array($ings)) {
            continue;
        }
        foreach ($ings as $ing) {
            $name = trim((string) ($ing['name'] ?? $ing['ingredient'] ?? $ing['text'] ?? ''));
            if ($name === '' && isset($ing['ingredientNotation'])) {
                $name = trim((string) $ing['ingredientNotation']);
            }
            $amount = '';
            if (isset($ing['quantity']) || isset($ing['unit'])) {
                $amount = trim(
                    trim((string) ($ing['quantity'] ?? '')) . ' ' . trim((string) ($ing['unit'] ?? ''))
                );
            } elseif (isset($ing['amount'])) {
                $amount = trim((string) $ing['amount']);
            }
            if ($name !== '') {
                $out[] = ['name' => $name, 'amount' => $amount !== '' ? $amount : null];
            }
        }
    }
    // Fallback: flat ingredient list
    if (!$out && isset($recipe['ingredients']) && is_array($recipe['ingredients'])) {
        foreach ($recipe['ingredients'] as $ing) {
            if (is_string($ing)) {
                $out[] = ['name' => $ing, 'amount' => null];
            } elseif (is_array($ing)) {
                $name = trim((string) ($ing['name'] ?? $ing['text'] ?? ''));
                if ($name !== '') {
                    $out[] = [
                        'name' => $name,
                        'amount' => isset($ing['amount']) ? (string) $ing['amount'] : null,
                    ];
                }
            }
        }
    }
    return $out;
}

$input = read_json();
$action = $input['action'] ?? '';
$country = trim((string) ($input['country'] ?? 'de'));
$host = country_host($country);
$lang = lang_for($country);

if ($action === 'login') {
    $email = trim((string) ($input['email'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    if ($email === '' || $password === '') {
        respond(400, ['ok' => false, 'message' => 'Cookidoo E-Mail und Passwort erforderlich.']);
    }

    $res = http_request(
        'POST',
        rtrim($host, '/') . '/ciam/auth/token',
        [
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
            'Authorization: ' . COOKIDOO_AUTH,
        ],
        http_build_query([
            'grant_type' => 'password',
            'username' => $email,
            'password' => $password,
        ])
    );

    if (!$res['ok'] || !$res['json'] || empty($res['json']['access_token'])) {
        $detail = $res['json']['error_description']
            ?? $res['json']['error']
            ?? ($res['raw'] ? substr($res['raw'], 0, 180) : 'Login fehlgeschlagen');
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Login fehlgeschlagen: ' . (is_string($detail) ? $detail : 'ungültige Zugangsdaten oder API-Änderung.'),
            'hint' => 'Vorwerk stellt Passwort-Login um. Wenn der Login scheitert, kannst du Rezepte weiter per Link/ID importieren, sobald ein Token vorhanden ist — oder Zugangsdaten prüfen.',
        ]);
    }

    $token = $res['json']['access_token'];
    $refresh = $res['json']['refresh_token'] ?? '';

    // Optional: pull a few favorites / custom collection titles as import suggestions.
    $suggestions = [];
    $fav = http_request(
        'GET',
        rtrim($host, '/') . "/organize/{$lang}/api/custom-list",
        [
            'Accept: application/json',
            'Authorization: Bearer ' . $token,
        ]
    );
    if ($fav['ok'] && isset($fav['json']) && is_array($fav['json'])) {
        $lists = $fav['json']['customLists'] ?? $fav['json']['lists'] ?? $fav['json'];
        if (is_array($lists)) {
            foreach ($lists as $list) {
                if (!is_array($list)) {
                    continue;
                }
                $title = $list['title'] ?? $list['name'] ?? null;
                if (is_string($title) && $title !== '') {
                    $suggestions[] = ['title' => $title, 'id' => $list['id'] ?? null];
                }
            }
        }
    }

    respond(200, [
        'ok' => true,
        'message' => 'Cookidoo-Konto verknüpft.',
        'accessToken' => $token,
        'refreshToken' => $refresh,
        'country' => $country,
        'language' => $lang,
        'suggestions' => array_slice($suggestions, 0, 12),
    ]);
}

if ($action === 'importRecipe') {
    $token = trim((string) ($input['accessToken'] ?? ''));
    $ref = trim((string) ($input['recipe'] ?? $input['url'] ?? ''));
    $recipeId = parse_recipe_id($ref);
    if ($recipeId === null) {
        respond(400, ['ok' => false, 'message' => 'Rezept-Link oder ID fehlt.']);
    }
    if ($token === '') {
        respond(401, ['ok' => false, 'message' => 'Bitte zuerst Cookidoo verknüpfen (Login).']);
    }

    $url = rtrim($host, '/') . '/recipes/recipe/' . rawurlencode($lang) . '/' . rawurlencode($recipeId);
    $res = http_request(
        'GET',
        $url,
        [
            'Accept: application/vnd.vorwerk.recipe.embedded.hal+json, application/json',
            'Authorization: Bearer ' . $token,
        ]
    );

    if (!$res['ok'] || !$res['json']) {
        // Try international/de host fallback once for DE users with odd IDs
        respond(404, [
            'ok' => false,
            'message' => 'Rezept konnte nicht geladen werden (' . $recipeId . ').',
            'status' => $res['status'],
        ]);
    }

    $recipe = $res['json'];
    $title = $recipe['name'] ?? $recipe['title'] ?? ('Cookidoo ' . $recipeId);
    $ingredients = normalize_ingredients($recipe);
    $notes = '';
    if (isset($recipe['totalTime'])) {
        $notes = 'Gesamtzeit: ' . $recipe['totalTime'];
    }

    respond(200, [
        'ok' => true,
        'message' => 'Rezept importiert: ' . $title,
        'recipe' => [
            'id' => $recipeId,
            'title' => $title,
            'ingredients' => $ingredients,
            'notes' => $notes,
            'cookidooUrl' => "https://cookidoo.de/recipes/recipe/{$lang}/{$recipeId}",
            'tags' => ['cookidoo'],
        ],
    ]);
}

respond(400, ['ok' => false, 'message' => 'Unbekannte Aktion.']);
