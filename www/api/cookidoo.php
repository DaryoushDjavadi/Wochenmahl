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
function cookies_from_cookielist(array $lines): array {
    $out = [];
    foreach ($lines as $line) {
        if (!is_string($line) || $line === '' || str_starts_with($line, '#')) {
            if (is_string($line) && str_starts_with($line, '#HttpOnly_')) {
                $line = substr($line, strlen('#HttpOnly_'));
            } else {
                continue;
            }
        }
        $parts = explode("\t", $line);
        if (count($parts) < 7) {
            continue;
        }
        $out[] = [
            'key' => $parts[5],
            'value' => $parts[6],
            'domain' => ltrim($parts[0], '.'),
            'path' => $parts[2] !== '' ? $parts[2] : '/',
        ];
    }
    return $out;
}

function merge_cookies(array $into, array $add): array {
    $map = [];
    foreach (array_merge($into, $add) as $c) {
        if (!is_array($c) || empty($c['key'])) {
            continue;
        }
        $domain = ltrim((string) ($c['domain'] ?? ''), '.');
        $key = strtolower($domain) . '|' . $c['key'];
        // empty value = delete
        if (($c['value'] ?? '') === '' && isset($map[$key])) {
            unset($map[$key]);
            continue;
        }
        if (($c['value'] ?? '') === '') {
            continue;
        }
        $map[$key] = [
            'key' => (string) $c['key'],
            'value' => (string) $c['value'],
            'domain' => $domain,
            'path' => (string) ($c['path'] ?? '/'),
        ];
    }
    return array_values($map);
}

function parse_set_cookie_headers(array $headerLines, string $fallbackHost): array {
    $cookies = [];
    $fallbackHost = preg_replace('#^https?://#', '', $fallbackHost) ?: $fallbackHost;
    $fallbackHost = explode('/', $fallbackHost)[0];
    foreach ($headerLines as $hdr) {
        if (!preg_match('/^Set-Cookie:\s*(.+)$/i', $hdr, $m)) {
            continue;
        }
        $parts = array_map('trim', explode(';', $m[1]));
        if ($parts === [] || $parts[0] === '') {
            continue;
        }
        $nv = explode('=', array_shift($parts), 2);
        $name = trim($nv[0]);
        $value = isset($nv[1]) ? trim($nv[1]) : '';
        if ($name === '') {
            continue;
        }
        $domain = $fallbackHost;
        $path = '/';
        foreach ($parts as $attr) {
            $ap = explode('=', $attr, 2);
            $ak = strtolower(trim($ap[0]));
            $av = isset($ap[1]) ? trim($ap[1]) : '';
            if ($ak === 'domain' && $av !== '') {
                $domain = ltrim($av, '.');
            } elseif ($ak === 'path' && $av !== '') {
                $path = $av;
            }
        }
        $cookies[] = [
            'key' => $name,
            'value' => $value,
            'domain' => $domain,
            'path' => $path,
        ];
    }
    return $cookies;
}

function cookie_header_for_url(array $cookies, string $url): string {
    $host = parse_url($url, PHP_URL_HOST) ?: '';
    $path = parse_url($url, PHP_URL_PATH) ?: '/';
    $parts = [];
    foreach ($cookies as $c) {
        if (!is_array($c) || empty($c['key'])) {
            continue;
        }
        $domain = ltrim((string) ($c['domain'] ?? ''), '.');
        if ($domain !== '' && $host !== $domain && !str_ends_with($host, '.' . $domain)) {
            continue;
        }
        $cpath = (string) ($c['path'] ?? '/');
        if ($cpath !== '/' && !str_starts_with($path, $cpath)) {
            continue;
        }
        $parts[$c['key']] = $c['key'] . '=' . $c['value'];
    }
    return implode('; ', array_values($parts));
}

function write_cookie_file(string $path, array $cookies): void {
    $lines = ["# Netscape HTTP Cookie File", ''];
    foreach ($cookies as $c) {
        if (!is_array($c) || empty($c['key'])) {
            continue;
        }
        $domain = (string) ($c['domain'] ?? '');
        // Leading dot helps curl match subdomains
        if ($domain !== '' && !str_starts_with($domain, '.')) {
            $domain = '.' . $domain;
        }
        $lines[] = implode("\t", [
            $domain,
            'TRUE',
            (string) ($c['path'] ?? '/'),
            'TRUE',
            '0',
            (string) $c['key'],
            (string) ($c['value'] ?? ''),
        ]);
    }
    file_put_contents($path, implode("\n", $lines) . "\n");
}

function cookie_temp_path(): string {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $path = tempnam(is_dir($dir) && is_writable($dir) ? $dir : sys_get_temp_dir(), 'ckjar_');
    return $path !== false ? $path : (sys_get_temp_dir() . '/ckjar_' . uniqid('', true));
}

/**
 * HTTP request with dual cookie handling:
 * - Netscape cookie file (curl engine, cross-domain redirects)
 * - Manual Set-Cookie parse as backup (some hosts mishandle COOKIELIST)
 *
 * @param list<array{key:string,value:string,domain:string,path:string}> $cookies
 * @return array{ok:bool,status:int,error:?string,json:mixed,raw:string,url:string,headers:list<string>,cookies:list<array{key:string,value:string,domain:string,path:string}>}
 */
function http_cookied(
    string $method,
    string $url,
    array $cookies,
    array $headers = [],
    ?string $body = null,
    bool $follow = true,
    int $maxRedirects = 15,
): array {
    $cookieFile = cookie_temp_path();
    write_cookie_file($cookieFile, $cookies);

    $current = $url;
    $methodUse = strtoupper($method);
    $bodyUse = $body;
    $allHeaders = [];

    for ($i = 0; $i <= $maxRedirects; $i++) {
        $ch = curl_init($current);
        $cookieHeader = cookie_header_for_url($cookies, $current);
        $reqHeaders = array_merge([
            'User-Agent: ' . BROWSER_UA,
            'Accept-Language: de-DE,de;q=0.9,en;q=0.8',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        ], $headers);
        // Explicit Cookie header + jar: some PHP builds drop cross-domain jar cookies
        if ($cookieHeader !== '') {
            $reqHeaders[] = 'Cookie: ' . $cookieHeader;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $methodUse,
            CURLOPT_HTTPHEADER => $reqHeaders,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_COOKIEJAR => $cookieFile,
            CURLOPT_COOKIEFILE => $cookieFile,
        ]);
        if ($bodyUse !== null && ($methodUse === 'POST' || $methodUse === 'PUT')) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyUse);
        }
        $rawFull = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $error = curl_error($ch);
        $cookielist = curl_getinfo($ch, CURLINFO_COOKIELIST);
        curl_close($ch);

        if ($rawFull === false) {
            @unlink($cookieFile);
            return [
                'ok' => false,
                'status' => 0,
                'error' => $error ?: 'curl failed',
                'json' => null,
                'raw' => '',
                'url' => $current,
                'headers' => [],
                'cookies' => $cookies,
            ];
        }

        $rawHeaders = substr($rawFull, 0, $headerSize);
        $rawBody = substr($rawFull, $headerSize);
        $hdrLines = preg_split("/\r\n|\n|\r/", $rawHeaders) ?: [];
        $allHeaders = $hdrLines;

        $host = parse_url($current, PHP_URL_HOST) ?: '';
        $cookies = merge_cookies($cookies, parse_set_cookie_headers($hdrLines, $host));
        if (is_array($cookielist)) {
            $cookies = merge_cookies($cookies, cookies_from_cookielist($cookielist));
        }
        $cookies = merge_cookies($cookies, cookies_from_cookielist(
            array_values(array_filter(
                file($cookieFile, FILE_IGNORE_NEW_LINES) ?: [],
                static fn($line) => is_string($line)
            ))
        ));
        write_cookie_file($cookieFile, $cookies);

        $location = null;
        foreach ($hdrLines as $h) {
            if (preg_match('/^Location:\s*(.+)$/i', $h, $lm)) {
                $location = trim($lm[1]);
                break;
            }
        }

        if (
            $follow
            && $location !== null
            && $location !== ''
            && in_array($status, [301, 302, 303, 307, 308], true)
        ) {
            if (str_starts_with($location, '/')) {
                $scheme = parse_url($current, PHP_URL_SCHEME) ?: 'https';
                $h = parse_url($current, PHP_URL_HOST) ?: '';
                $location = $scheme . '://' . $h . $location;
            } elseif (!preg_match('#^https?://#i', $location)) {
                $basePath = preg_replace('#/[^/]*$#', '/', $current) ?: $current;
                $location = rtrim($basePath, '/') . '/' . ltrim($location, '/');
            }
            // After POST+302/303, browsers switch to GET
            if ($methodUse === 'POST' && in_array($status, [301, 302, 303], true)) {
                $methodUse = 'GET';
                $bodyUse = null;
                $headers = array_values(array_filter(
                    $headers,
                    static fn($h) => !preg_match('/^Content-Type:/i', $h)
                        && !preg_match('/^Origin:/i', $h)
                ));
            }
            $current = $location;
            continue;
        }

        @unlink($cookieFile);
        $json = json_decode($rawBody, true);
        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'error' => null,
            'json' => is_array($json) ? $json : null,
            'raw' => $rawBody,
            'url' => $current,
            'headers' => $allHeaders,
            'cookies' => $cookies,
        ];
    }

    @unlink($cookieFile);
    return [
        'ok' => false,
        'status' => 0,
        'error' => 'too many redirects',
        'json' => null,
        'raw' => '',
        'url' => $current,
        'headers' => [],
        'cookies' => $cookies,
    ];
}

function extract_request_id(string $html, string $url = ''): ?string {
    if (preg_match('/[?&]requestId=([0-9a-f-]{36})/i', $url, $m)) {
        return $m[1];
    }
    if (preg_match('/<input[^>]*name=["\']requestId["\'][^>]*value=["\']([^"\']+)["\']/i', $html, $m)) {
        return $m[1];
    }
    if (preg_match('/<input[^>]*value=["\']([0-9a-f-]{36})["\'][^>]*name=["\']requestId["\']/i', $html, $m)) {
        return $m[1];
    }
    if (preg_match('/requestId["\']?\s*[:=]\s*["\']([0-9a-f-]{36})["\']/i', $html, $m)) {
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

function cookie_names(array $cookies): array {
    $names = [];
    foreach ($cookies as $c) {
        if (is_array($c) && isset($c['key'])) {
            $names[(string) $c['key']] = true;
        }
    }
    return $names;
}

function require_session(array $input): array {
    $cookies = session_cookies_from_input($input);
    $names = cookie_names($cookies);
    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Session fehlt oder ist abgelaufen — bitte erneut verknüpfen.',
        ]);
    }
    return $cookies;
}

function market_for(string $country): string {
    $country = strtolower($country);
    return match ($country) {
        'ch' => 'ch',
        'at' => 'at',
        'ie', 'gb', 'uk' => 'ie',
        'it' => 'it',
        'pl' => 'pl',
        default => 'de',
    };
}

$input = read_json();
$action = (string) ($input['action'] ?? '');
$country = trim((string) ($input['country'] ?? 'de'));
$base = cookidoo_base($country);
$lang = lang_for($country);
$market = market_for($country);

if ($action === 'login') {
    $email = trim((string) ($input['email'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    if ($email === '' || $password === '') {
        respond(400, ['ok' => false, 'message' => 'Cookidoo E-Mail und Passwort erforderlich.']);
    }

    $cookies = [];
    $loginUrl = rtrim($base, '/') . '/profile/' . rawurlencode($lang)
        . '/login?redirectAfterLogin=' . rawurlencode('/foundation/' . $lang . '/for-you');

    $page = http_cookied(
        'GET',
        $loginUrl,
        $cookies,
        ['Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    );
    $cookies = $page['cookies'];

    if ($page['status'] !== 200 || $page['raw'] === '') {
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginseite nicht erreichbar (Status ' . $page['status'] . ').',
            'hint' => 'Host/Netzwerk prüfen. Final-URL: ' . ($page['url'] ?? ''),
            'debug' => [
                'finalUrl' => $page['url'] ?? null,
                'cookieKeys' => array_keys(cookie_names($cookies)),
            ],
        ]);
    }

    $requestId = extract_request_id($page['raw'], $page['url'] ?? '');
    if ($requestId === null) {
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginformular konnte nicht gelesen werden (requestId fehlt).',
            'hint' => 'Vermutlich Captcha/Bot-Schutz oder geändertes Login-HTML.',
            'debug' => [
                'finalUrl' => $page['url'] ?? null,
                'cookieKeys' => array_keys(cookie_names($cookies)),
                'htmlSnippet' => substr(preg_replace('/\s+/', ' ', $page['raw']), 0, 220),
            ],
        ]);
    }

    $post = http_cookied(
        'POST',
        CIAM_LOGIN_SRV,
        $cookies,
        [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: https://eu.login.vorwerk.com',
            'Referer: https://eu.login.vorwerk.com/ciam/login?requestId=' . rawurlencode($requestId)
                . '&view_type=login&market=' . rawurlencode($market) . '&ui_locales=' . rawurlencode($lang),
        ],
        http_build_query([
            'requestId' => $requestId,
            'username' => $email,
            'password' => $password,
        ]),
        true,
    );
    $cookies = $post['cookies'];
    $names = cookie_names($cookies);

    // If still missing auth cookies, try explicit callback URL from body/location
    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        if (preg_match('#https?://[^"\'\s]+/oauth2/callback\?[^"\'\s]+#i', $post['raw'] . ' ' . ($post['url'] ?? ''), $cm)) {
            $cb = html_entity_decode($cm[0]);
            $cbRes = http_cookied('GET', $cb, $cookies, [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ]);
            $cookies = $cbRes['cookies'];
            $names = cookie_names($cookies);
            $post['url'] = $cbRes['url'];
            $post['status'] = $cbRes['status'];
        }
    }

    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        $finalUrl = (string) ($post['url'] ?? '');
        $badPass = stripos($finalUrl, 'invalid_username_password') !== false
            || stripos($post['raw'], 'invalid_username_password') !== false
            || stripos($post['raw'], 'username or password is invalid') !== false;
        $looksLikeLoginAgain = $badPass
            || stripos($finalUrl, 'login') !== false
            || stripos($post['raw'], 'requestId') !== false;
        respond(401, [
            'ok' => false,
            'message' => $badPass
                ? 'Cookidoo: E-Mail oder Passwort ist falsch.'
                : ($looksLikeLoginAgain
                    ? 'Cookidoo-Login abgelehnt — E-Mail/Passwort prüfen (oder 2FA/Captcha).'
                    : 'Cookidoo-Session konnte nicht hergestellt werden.'),
            'hint' => $badPass
                ? 'Zugangsdaten wie auf cookidoo.de eingeben. Land muss zum Konto passen (meist DE).'
                : 'Bitte Land=DE prüfen. Bei 2FA/Captcha geht Auto-Login oft nicht — Rezepte dann per Link/ID importieren.',
            'debug' => [
                'finalUrl' => $finalUrl !== '' ? preg_replace('/password=[^&]*/i', 'password=***', $finalUrl) : null,
                'status' => $post['status'] ?? null,
                'cookieKeys' => array_keys($names),
                'market' => $market,
                'base' => $base,
                'badPassword' => $badPass,
            ],
        ]);
    }

    $suggestions = [];
    $fav = http_cookied(
        'GET',
        rtrim($base, '/') . "/organize/{$lang}/api/custom-list",
        $cookies,
        ['Accept: application/json'],
        null,
        true,
    );
    $cookies = $fav['cookies'];
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

    // Keep only cookies useful for later API calls (smaller payload)
    $keep = ['_oauth2_proxy', 'v-authenticated', 'v-is-authenticated'];
    $cookies = array_values(array_filter(
        $cookies,
        static function ($c) use ($keep): bool {
            if (!is_array($c)) {
                return false;
            }
            $key = (string) ($c['key'] ?? '');
            return in_array($key, $keep, true) || str_starts_with($key, 'v-');
        }
    ));

    respond(200, [
        'ok' => true,
        'message' => 'Cookidoo-Konto verknüpft (OAuth2-Session).',
        'cookies' => $cookies,
        'accessToken' => '',
        'refreshToken' => '',
        'country' => $country,
        'language' => $lang,
        'suggestions' => array_slice($suggestions, 0, 12),
    ]);
}

function api_get(string $url, array $cookies, string $accept): array {
    return http_cookied('GET', $url, $cookies, ['Accept: ' . $accept], null, true);
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
