<?php
/**
 * Cookidoo proxy for Wochenkochen / Wochenmahl.
 *
 * Uses the browser OAuth2 cookie flow against cookidoo.{tld}
 * (password-grant on tmmobile is deprecated and returns HTML errors).
 */
declare(strict_types=1);

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }
        return substr($haystack, -strlen($needle)) === $needle;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

const CIAM_LOGIN_SRV = 'https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

function human_error(?string $raw, string $fallback): string {
    if ($raw === null || $raw === '') {
        return $fallback;
    }
    $trim = trim($raw);
    if (stripos($trim, '<!DOCTYPE') !== false || stripos($trim, '<html') !== false) {
        return $fallback . ' (Cookidoo antwortete mit einer HTML-Seite — alter Login ist abgeschaltet.)';
    }
    if (strlen($trim) > 180) {
        return substr($trim, 0, 180) . '…';
    }
    return $trim;
}

function cookidoo_base(string $country): string {
    $country = strtolower($country);
    return match ($country) {
        'ch' => 'https://cookidoo.ch',
        'at' => 'https://cookidoo.at',
        'ie', 'gb', 'uk' => 'https://cookidoo.co.uk',
        'intl', 'xp' => 'https://cookidoo.international',
        'it' => 'https://cookidoo.it',
        'pl' => 'https://cookidoo.pl',
        default => 'https://cookidoo.de',
    };
}

function lang_for(string $country): string {
    $country = strtolower($country);
    return match ($country) {
        'ch' => 'de-CH',
        'at' => 'de-DE',
        'ie', 'gb', 'uk' => 'en-GB',
        'it' => 'it-IT',
        'pl' => 'pl-PL',
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

function is_list_array(array $arr): bool {
    if (function_exists('array_is_list')) {
        return array_is_list($arr);
    }
    if ($arr === []) {
        return true;
    }
    return array_keys($arr) === range(0, count($arr) - 1);
}

function normalize_search_hits($payload): array {
    $hits = [];
    if (!is_array($payload)) {
        return $hits;
    }
    $candidates = [];
    foreach (['recipeSearchResults', 'recipes', 'items', 'hits', 'content', 'results', 'data'] as $key) {
        if (isset($payload[$key]) && is_array($payload[$key])) {
            $candidates = $payload[$key];
            break;
        }
    }
    if (!$candidates && is_list_array($payload)) {
        $candidates = $payload;
    }
    if (!$candidates && isset($payload['recipeSearch']['recipes']) && is_array($payload['recipeSearch']['recipes'])) {
        $candidates = $payload['recipeSearch']['recipes'];
    }
    foreach ($candidates as $row) {
        if (!is_array($row)) {
            continue;
        }
        if (isset($row['recipe']) && is_array($row['recipe'])) {
            $row = $row['recipe'];
        }
        $id = $row['id'] ?? $row['recipeId'] ?? $row['identifier'] ?? null;
        $title = $row['title'] ?? $row['name'] ?? $row['recipeName'] ?? null;
        if (!is_string($id) || $id === '' || !is_string($title) || $title === '') {
            continue;
        }
        $id = preg_replace('/^recipe-/', '', $id) ?: $id;
        $hits[] = [
            'id' => $id,
            'title' => $title,
            'totalTime' => $row['totalTime'] ?? $row['preparationTime'] ?? null,
            'image' => $row['image'] ?? $row['thumbnail'] ?? $row['squareImage'] ?? null,
        ];
    }
    return $hits;
}

/** @return list<array{key:string,value:string,domain:string,path:string}> */
function parse_cookie_file(string $path): array {
    $out = [];
    if (!is_file($path)) {
        return $out;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        if ($line === '' || $line[0] === '#') {
            // Netscape HttpOnly marker: #HttpOnly_domain
            if (str_starts_with($line, '#HttpOnly_')) {
                $line = substr($line, strlen('#HttpOnly_'));
            } else {
                continue;
            }
        }
        $parts = explode("\t", $line);
        if (count($parts) < 7) {
            continue;
        }
        $domain = ltrim($parts[0], '.');
        $out[] = [
            'key' => $parts[5],
            'value' => $parts[6],
            'domain' => $domain,
            'path' => $parts[2] !== '' ? $parts[2] : '/',
        ];
    }
    return $out;
}

function write_cookie_file(string $path, array $cookies): void {
    $lines = ["# Netscape HTTP Cookie File", "# https://curl.se/docs/http-cookies.html", ''];
    foreach ($cookies as $c) {
        if (!is_array($c) || empty($c['key'])) {
            continue;
        }
        $domain = (string) ($c['domain'] ?? '');
        $flag = str_starts_with($domain, '.') ? 'TRUE' : 'FALSE';
        $pathPart = (string) ($c['path'] ?? '/');
        $secure = 'FALSE';
        $expire = '0';
        $name = (string) $c['key'];
        $value = (string) ($c['value'] ?? '');
        $lines[] = implode("\t", [$domain, $flag, $pathPart, $secure, $expire, $name, $value]);
    }
    file_put_contents($path, implode("\n", $lines) . "\n");
}

function cookie_header_for_host(array $cookies, string $host): string {
    $host = preg_replace('#^https?://#', '', $host) ?: $host;
    $host = explode('/', $host)[0];
    $parts = [];
    foreach ($cookies as $c) {
        if (!is_array($c) || empty($c['key'])) {
            continue;
        }
        $domain = ltrim((string) ($c['domain'] ?? ''), '.');
        if ($domain !== '' && $host !== $domain && !str_ends_with($host, '.' . $domain)) {
            continue;
        }
        $parts[$c['key']] = $c['key'] . '=' . $c['value'];
    }
    return implode('; ', array_values($parts));
}

function curl_with_cookies(
    string $method,
    string $url,
    string $cookieFile,
    array $headers = [],
    ?string $body = null,
    bool $follow = true,
): array {
    $ch = curl_init($url);
    $hdrs = array_merge([
        'User-Agent: ' . BROWSER_UA,
        'Accept-Language: de-DE,de;q=0.9,en;q=0.8',
    ], $headers);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $hdrs,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_FOLLOWLOCATION => $follow,
        CURLOPT_MAXREDIRS => 12,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HEADER => false,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false) {
        return [
            'ok' => false,
            'status' => 0,
            'error' => $error ?: 'curl failed',
            'json' => null,
            'raw' => '',
            'url' => $finalUrl,
        ];
    }
    $json = json_decode($response, true);
    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'error' => null,
        'json' => is_array($json) ? $json : null,
        'raw' => $response,
        'url' => $finalUrl,
    ];
}

function extract_request_id(string $html): ?string {
    if (preg_match('/<input[^>]*name=["\']requestId["\'][^>]*value=["\']([^"\']+)["\']/i', $html, $m)) {
        return $m[1];
    }
    if (preg_match('/<input[^>]*value=["\']([0-9a-f-]{36})["\'][^>]*name=["\']requestId["\']/i', $html, $m)) {
        return $m[1];
    }
    return null;
}

function session_cookies_from_input(array $input): array {
    $raw = $input['cookies'] ?? $input['sessionCookies'] ?? null;
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    if (is_array($raw)) {
        return $raw;
    }
    return [];
}

function require_session(array $input): array {
    $cookies = session_cookies_from_input($input);
    $names = [];
    foreach ($cookies as $c) {
        if (is_array($c) && isset($c['key'])) {
            $names[$c['key']] = true;
        }
    }
    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Session fehlt oder ist abgelaufen — bitte erneut verknüpfen.',
        ]);
    }
    return $cookies;
}

$input = read_json();
$action = (string) ($input['action'] ?? '');
$country = trim((string) ($input['country'] ?? 'de'));
$base = cookidoo_base($country);
$lang = lang_for($country);

if ($action === 'login') {
    $email = trim((string) ($input['email'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    if ($email === '' || $password === '') {
        respond(400, ['ok' => false, 'message' => 'Cookidoo E-Mail und Passwort erforderlich.']);
    }

    $cookieFile = tempnam(sys_get_temp_dir(), 'cookidoo_ck_');
    if ($cookieFile === false) {
        respond(500, ['ok' => false, 'message' => 'Temp-Datei für Cookies fehlgeschlagen.']);
    }

    $loginUrl = rtrim($base, '/') . '/profile/' . rawurlencode($lang)
        . '/login?redirectAfterLogin=' . rawurlencode('/foundation/' . $lang . '/for-you');

    $page = curl_with_cookies(
        'GET',
        $loginUrl,
        $cookieFile,
        ['Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    );

    if ($page['status'] !== 200 || $page['raw'] === '') {
        @unlink($cookieFile);
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginseite nicht erreichbar (Status '
                . $page['status'] . ').',
            'hint' => 'Netzwerk/Host prüfen oder später erneut versuchen.',
        ]);
    }

    $requestId = extract_request_id($page['raw']);
    if ($requestId === null) {
        @unlink($cookieFile);
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginformular konnte nicht gelesen werden (requestId fehlt).',
            'hint' => 'Vorwerk hat den Login evtl. erneut geändert.',
        ]);
    }

    $post = curl_with_cookies(
        'POST',
        CIAM_LOGIN_SRV,
        $cookieFile,
        [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: https://eu.login.vorwerk.com',
            'Referer: https://eu.login.vorwerk.com/',
        ],
        http_build_query([
            'requestId' => $requestId,
            'username' => $email,
            'password' => $password,
        ]),
        true,
    );

    $cookies = parse_cookie_file($cookieFile);
    @unlink($cookieFile);

    $names = [];
    foreach ($cookies as $c) {
        $names[$c['key']] = true;
    }
    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Login fehlgeschlagen — E-Mail/Passwort prüfen oder Session wurde nicht gesetzt.',
            'hint' => 'Vorwerk nutzt jetzt den Browser-OAuth2-Login. Bei 2FA/Captcha kann der automatische Login scheitern.',
            'status' => $post['status'],
            'finalUrl' => $post['url'] ?? null,
        ]);
    }

    // Optional: custom lists as suggestions
    $suggestions = [];
    $cookieFile2 = tempnam(sys_get_temp_dir(), 'cookidoo_ck_');
    if ($cookieFile2 !== false) {
        write_cookie_file($cookieFile2, $cookies);
        $fav = curl_with_cookies(
            'GET',
            rtrim($base, '/') . "/organize/{$lang}/api/custom-list",
            $cookieFile2,
            ['Accept: application/json'],
        );
        @unlink($cookieFile2);
        if ($fav['ok'] && is_array($fav['json'])) {
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
    }

    respond(200, [
        'ok' => true,
        'message' => 'Cookidoo-Konto verknüpft (OAuth2-Session).',
        'cookies' => $cookies,
        'accessToken' => '', // legacy field — session uses cookies
        'refreshToken' => '',
        'country' => $country,
        'language' => $lang,
        'suggestions' => array_slice($suggestions, 0, 12),
    ]);
}

function api_get(string $url, array $cookies, string $accept): array {
    $cookieFile = tempnam(sys_get_temp_dir(), 'cookidoo_ck_');
    if ($cookieFile === false) {
        return ['ok' => false, 'status' => 0, 'json' => null, 'raw' => '', 'error' => 'temp'];
    }
    write_cookie_file($cookieFile, $cookies);
    $res = curl_with_cookies('GET', $url, $cookieFile, ['Accept: ' . $accept]);
    @unlink($cookieFile);
    return $res;
}

if ($action === 'importRecipe') {
    $cookies = require_session($input);
    $ref = trim((string) ($input['recipe'] ?? $input['url'] ?? ''));
    $recipeId = parse_recipe_id($ref);
    if ($recipeId === null) {
        respond(400, ['ok' => false, 'message' => 'Rezept-Link oder ID fehlt.']);
    }

    $url = rtrim($base, '/') . '/recipes/recipe/' . rawurlencode($lang) . '/' . rawurlencode($recipeId);
    $res = api_get(
        $url,
        $cookies,
        'application/vnd.vorwerk.recipe.embedded.hal+json, application/json',
    );

    if (!$res['ok'] || !$res['json']) {
        respond(404, [
            'ok' => false,
            'message' => 'Rezept konnte nicht geladen werden (' . $recipeId . '). '
                . human_error($res['raw'] ?? null, 'Session evtl. abgelaufen.'),
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
            'cookidooUrl' => rtrim($base, '/') . "/recipes/recipe/{$lang}/{$recipeId}",
            'tags' => ['cookidoo'],
        ],
    ]);
}

if ($action === 'search') {
    $cookies = require_session($input);
    $query = trim((string) ($input['query'] ?? ''));
    if ($query === '') {
        respond(400, ['ok' => false, 'message' => 'Suchbegriff fehlt.']);
    }

    $q = rawurlencode($query);
    $endpoints = [
        rtrim($base, '/') . "/eu/gatekeeper/api/v3/search/recipes?query={$q}&size=24&from=0",
        rtrim($base, '/') . "/explore/{$lang}/api/search?query={$q}&size=24",
        rtrim($base, '/') . "/community/{$lang}/search/recipes?query={$q}",
        rtrim($base, '/') . '/foundation/' . rawurlencode($lang) . '/search?query=' . $q,
    ];

    $tried = [];
    foreach ($endpoints as $url) {
        $res = api_get(
            $url,
            $cookies,
            'application/json, application/vnd.vorwerk.search.hal+json, application/hal+json',
        );
        $tried[] = ['url' => $url, 'status' => $res['status']];
        if (!$res['ok'] || !$res['json']) {
            continue;
        }
        $hits = normalize_search_hits($res['json']);
        if ($hits) {
            respond(200, [
                'ok' => true,
                'message' => count($hits) . ' Treffer',
                'recipes' => array_slice($hits, 0, 30),
                'engine' => $url,
            ]);
        }
    }

    respond(200, [
        'ok' => true,
        'message' => 'Keine Treffer über die API — auf Cookidoo.de suchen und Link/ID importieren.',
        'recipes' => [],
        'hint' => 'Fallback: cookidoo.de öffnen, Rezept kopieren, importieren.',
        'searchUrl' => rtrim($base, '/') . '/search?query=' . rawurlencode($query),
        'tried' => $tried,
    ]);
}

if ($action === 'lists') {
    $cookies = require_session($input);
    $lists = [];
    foreach ([
        rtrim($base, '/') . "/organize/{$lang}/api/custom-list",
        rtrim($base, '/') . "/organize/{$lang}/api/favorite",
    ] as $url) {
        $res = api_get($url, $cookies, 'application/json');
        if (!$res['ok'] || !is_array($res['json'])) {
            continue;
        }
        $raw = $res['json']['customLists']
            ?? $res['json']['lists']
            ?? $res['json']['favorites']
            ?? $res['json'];
        if (!is_array($raw)) {
            continue;
        }
        foreach ($raw as $list) {
            if (!is_array($list)) {
                continue;
            }
            $title = $list['title'] ?? $list['name'] ?? null;
            $id = $list['id'] ?? $list['listId'] ?? null;
            if (!is_string($title) || $title === '') {
                continue;
            }
            $lists[] = [
                'id' => is_string($id) ? $id : null,
                'title' => $title,
                'count' => $list['recipeCount'] ?? $list['count'] ?? null,
            ];
        }
    }

    respond(200, [
        'ok' => true,
        'message' => count($lists) ? (count($lists) . ' Listen') : 'Keine Listen gefunden.',
        'lists' => array_slice($lists, 0, 40),
    ]);
}

if ($action === 'listRecipes') {
    $cookies = require_session($input);
    $listId = trim((string) ($input['listId'] ?? ''));
    if ($listId === '') {
        respond(400, ['ok' => false, 'message' => 'Listen-ID fehlt.']);
    }

    $endpoints = [
        rtrim($base, '/') . "/organize/{$lang}/api/custom-list/" . rawurlencode($listId),
        rtrim($base, '/') . "/organize/{$lang}/api/custom-list/" . rawurlencode($listId) . '/recipes',
    ];

    foreach ($endpoints as $url) {
        $res = api_get($url, $cookies, 'application/json');
        if (!$res['ok'] || !is_array($res['json'])) {
            continue;
        }
        $recipesRaw = $res['json']['recipes']
            ?? $res['json']['recipeList']
            ?? $res['json']['items']
            ?? $res['json']['content']
            ?? [];
        if (!is_array($recipesRaw)) {
            continue;
        }
        $hits = normalize_search_hits(['recipes' => $recipesRaw]);
        if (!$hits) {
            foreach ($recipesRaw as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $id = $row['id'] ?? $row['recipeId'] ?? null;
                $title = $row['title'] ?? $row['name'] ?? null;
                if (is_string($id) && is_string($title)) {
                    $hits[] = ['id' => $id, 'title' => $title, 'totalTime' => null, 'image' => null];
                }
            }
        }
        if ($hits) {
            respond(200, [
                'ok' => true,
                'message' => count($hits) . ' Rezepte in der Liste',
                'recipes' => array_slice($hits, 0, 50),
            ]);
        }
    }

    respond(200, [
        'ok' => true,
        'message' => 'Liste konnte nicht gelesen werden — Rezept-ID/Link manuell importieren.',
        'recipes' => [],
    ]);
}

respond(400, ['ok' => false, 'message' => 'Unbekannte Aktion.']);
