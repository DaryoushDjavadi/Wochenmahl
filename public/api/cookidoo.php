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

function format_scalar_amount($value): string {
    if ($value === null || $value === '') {
        return '';
    }
    if (is_bool($value)) {
        return '';
    }
    if (is_int($value) || is_float($value)) {
        // Avoid trailing .0 for whole numbers.
        if (is_float($value) && floor($value) == $value) {
            return (string) (int) $value;
        }
        return rtrim(rtrim(sprintf('%.3F', (float) $value), '0'), '.');
    }
    if (is_string($value)) {
        $trim = trim($value);
        return strcasecmp($trim, 'Array') === 0 ? '' : $trim;
    }
    return '';
}

/**
 * Cookidoo quantity is often {"value":100} or {"from":10,"to":15}.
 */
function format_quantity($quantity): string {
    if ($quantity === null || $quantity === '') {
        return '';
    }
    if (is_array($quantity)) {
        if (isset($quantity['value'])) {
            return format_scalar_amount($quantity['value']);
        }
        $from = format_scalar_amount($quantity['from'] ?? null);
        $to = format_scalar_amount($quantity['to'] ?? null);
        if ($from !== '' && $to !== '') {
            return $from . '–' . $to;
        }
        return $from !== '' ? $from : $to;
    }
    return format_scalar_amount($quantity);
}

function format_ingredient_amount(array $ing): ?string {
    $unit = format_scalar_amount(
        $ing['unitNotation'] ?? $ing['unit'] ?? $ing['unitText'] ?? ''
    );

    $qty = '';
    if (array_key_exists('quantity', $ing)) {
        $qty = format_quantity($ing['quantity']);
    } elseif (array_key_exists('amount', $ing)) {
        $amount = $ing['amount'];
        if (is_array($amount)) {
            $qty = format_quantity($amount);
            if ($unit === '') {
                $unit = format_scalar_amount(
                    $amount['unitNotation'] ?? $amount['unit'] ?? ''
                );
            }
        } else {
            $qty = format_scalar_amount($amount);
        }
    }

    $combined = trim($qty . ($unit !== '' ? ' ' . $unit : ''));
    return $combined !== '' ? $combined : null;
}

function normalize_ingredients(array $recipe): array {
    $out = [];
    $groups = $recipe['recipeIngredientGroups'] ?? $recipe['ingredientGroups'] ?? [];
    if (!is_array($groups)) {
        $groups = [];
    }
    foreach ($groups as $group) {
        // Some payloads nest ingredients; others put a single ingredient on the group.
        $ings = $group['recipeIngredients'] ?? $group['ingredients'] ?? null;
        if (!is_array($ings)) {
            if (isset($group['ingredientNotation']) || isset($group['name'])) {
                $ings = [$group];
            } else {
                continue;
            }
        }
        foreach ($ings as $ing) {
            if (!is_array($ing)) {
                if (is_string($ing) && trim($ing) !== '') {
                    $out[] = ['name' => trim($ing), 'amount' => null];
                }
                continue;
            }
            $name = trim((string) ($ing['ingredientNotation'] ?? $ing['name'] ?? $ing['ingredient'] ?? $ing['text'] ?? ''));
            $prep = trim((string) ($ing['preparation'] ?? ''));
            if ($name === '' && $prep !== '') {
                $name = $prep;
                $prep = '';
            }
            if ($name === '') {
                continue;
            }
            if ($prep !== '' && stripos($name, $prep) === false) {
                $name = $name . ' (' . $prep . ')';
            }
            $out[] = [
                'name' => $name,
                'amount' => format_ingredient_amount($ing),
            ];
        }
    }
    if (!$out && isset($recipe['ingredients']) && is_array($recipe['ingredients'])) {
        foreach ($recipe['ingredients'] as $ing) {
            if (is_string($ing)) {
                $out[] = ['name' => $ing, 'amount' => null];
            } elseif (is_array($ing)) {
                $name = trim((string) ($ing['ingredientNotation'] ?? $ing['name'] ?? $ing['text'] ?? ''));
                if ($name !== '') {
                    $out[] = [
                        'name' => $name,
                        'amount' => format_ingredient_amount($ing),
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
    // Prefer the shapes used by cookidoo.de/search/{locale} and the cookidoo-api lib.
    foreach (['data', 'recipes', 'recipeSearchResults', 'hits', 'items', 'content', 'results'] as $key) {
        if (!isset($payload[$key]) || !is_array($payload[$key]) || $payload[$key] === []) {
            continue;
        }
        $candidates = $payload[$key];
        break;
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
        $id = $row['id'] ?? $row['recipeId'] ?? $row['objectID'] ?? $row['identifier'] ?? null;
        $title = $row['title'] ?? $row['name'] ?? $row['recipeName'] ?? null;
        if (!is_string($id) || $id === '' || !is_string($title) || $title === '') {
            continue;
        }
        $id = preg_replace('/^recipe-/', '', $id) ?: $id;

        $image = $row['image'] ?? $row['thumbnail'] ?? $row['squareImage'] ?? null;
        if (!is_string($image) || $image === '') {
            $assets = $row['descriptiveAssets'] ?? null;
            if (is_array($assets)) {
                foreach ($assets as $asset) {
                    if (!is_array($asset)) {
                        continue;
                    }
                    foreach (['square', 'portrait', 'landscape'] as $variant) {
                        if (!empty($asset[$variant]) && is_string($asset[$variant])) {
                            $image = str_replace(
                                '{transformation}',
                                't_web_shared_recipe_221x240',
                                $asset[$variant]
                            );
                            break 2;
                        }
                    }
                }
            }
        } elseif (is_string($image) && str_contains($image, '{transformation}')) {
            $image = str_replace('{transformation}', 't_web_shared_recipe_221x240', $image);
        }

        $totalTime = $row['totalTime'] ?? $row['preparationTime'] ?? null;
        if (is_numeric($totalTime)) {
            $mins = (int) round(((float) $totalTime) / 60);
            $totalTime = $mins > 0 ? $mins . ' Min.' : null;
        }

        $hits[] = [
            'id' => $id,
            'title' => $title,
            'totalTime' => is_string($totalTime) ? $totalTime : null,
            'image' => is_string($image) ? $image : null,
        ];
    }
    return $hits;
}

function search_locale(string $lang): string {
    $part = explode('-', $lang)[0] ?? 'de';
    $part = strtolower(trim($part));
    return $part !== '' ? $part : 'de';
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
    $base = (is_dir($dir) && is_writable($dir)) ? $dir : sys_get_temp_dir();
    $path = tempnam($base, 'ckjar_');
    return $path !== false ? $path : ($base . '/ckjar_' . uniqid('', true));
}

/**
 * Cookie-aware HTTP via curl FOLLOWLOCATION (required on some hosts;
 * manual redirect loops can yield bogus 401s / drop CSRF cookies).
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
    int $maxRedirects = 20,
): array {
    $cookieFile = cookie_temp_path();
    write_cookie_file($cookieFile, $cookies);

    $methodUse = strtoupper($method);
    $setCookieHeaders = [];
    $ch = curl_init($url);
    $reqHeaders = [
        'User-Agent: ' . BROWSER_UA,
        'Accept-Language: de-DE,de;q=0.9,en;q=0.8',
    ];
    $hasAccept = false;
    foreach ($headers as $h) {
        if (preg_match('/^Accept:/i', $h)) {
            $hasAccept = true;
            break;
        }
    }
    if (!$hasAccept) {
        $reqHeaders[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7';
    }
    $reqHeaders = array_merge($reqHeaders, $headers);

    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $reqHeaders,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => $follow,
        CURLOPT_MAXREDIRS => $maxRedirects,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$setCookieHeaders): int {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $setCookieHeaders[] = trim($header);
            }
            return strlen($header);
        },
    ];

    if ($methodUse === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = $body ?? '';
    } elseif ($methodUse === 'PUT') {
        $opts[CURLOPT_CUSTOMREQUEST] = 'PUT';
        $opts[CURLOPT_POSTFIELDS] = $body ?? '';
    } elseif ($methodUse !== 'GET') {
        $opts[CURLOPT_CUSTOMREQUEST] = $methodUse;
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = $body;
        }
    }

    curl_setopt_array($ch, $opts);
    $rawBody = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($ch);
    $cookielist = curl_getinfo($ch, CURLINFO_COOKIELIST);
    curl_close($ch);

    if ($rawBody === false) {
        @unlink($cookieFile);
        return [
            'ok' => false,
            'status' => 0,
            'error' => $error ?: 'curl failed',
            'json' => null,
            'raw' => '',
            'url' => $finalUrl !== '' ? $finalUrl : $url,
            'headers' => $setCookieHeaders,
            'cookies' => $cookies,
        ];
    }

    $host = parse_url($finalUrl !== '' ? $finalUrl : $url, PHP_URL_HOST) ?: '';
    $cookies = merge_cookies($cookies, parse_set_cookie_headers($setCookieHeaders, $host));
    if (is_array($cookielist)) {
        $cookies = merge_cookies($cookies, cookies_from_cookielist($cookielist));
    }
    // File may be empty on some hosts until process end — COOKIELIST is authoritative
    if (is_file($cookieFile)) {
        $fileLines = file($cookieFile, FILE_IGNORE_NEW_LINES);
        if (is_array($fileLines)) {
            $cookies = merge_cookies($cookies, cookies_from_cookielist($fileLines));
        }
        @unlink($cookieFile);
    }

    $json = json_decode($rawBody, true);
    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $error !== '' ? $error : null,
        'json' => is_array($json) ? $json : null,
        'raw' => $rawBody,
        'url' => $finalUrl !== '' ? $finalUrl : $url,
        'headers' => $setCookieHeaders,
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

    // One shared curl cookie jar for the whole OAuth redirect chain (GET + POST).
    // Re-serializing cookies between hops broke CSRF on some PHP/curl hosts.
    $cookieFile = cookie_temp_path();
    file_put_contents($cookieFile, "# Netscape HTTP Cookie File\n\n");

    $loginUrl = rtrim($base, '/') . '/profile/' . rawurlencode($lang)
        . '/login?redirectAfterLogin=' . rawurlencode('/foundation/' . $lang . '/for-you');

    $setCookies = [];
    $ch = curl_init($loginUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 20,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => [
            'User-Agent: ' . BROWSER_UA,
            'Accept-Language: de-DE,de;q=0.9,en;q=0.8',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ],
        CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$setCookies): int {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $setCookies[] = trim($header);
            }
            return strlen($header);
        },
    ]);
    $pageBody = curl_exec($ch);
    $pageStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $pageUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $pageErr = curl_error($ch);
    $listAfterGet = curl_getinfo($ch, CURLINFO_COOKIELIST);
    curl_close($ch);

    $cookies = [];
    if (is_array($listAfterGet)) {
        $cookies = merge_cookies($cookies, cookies_from_cookielist($listAfterGet));
    }
    $cookies = merge_cookies(
        $cookies,
        parse_set_cookie_headers($setCookies, parse_url($pageUrl, PHP_URL_HOST) ?: 'cookidoo.de')
    );

    if ($pageBody === false || $pageStatus !== 200 || $pageBody === '') {
        @unlink($cookieFile);
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginseite nicht erreichbar (Status ' . $pageStatus . ').',
            'hint' => $pageErr !== '' ? $pageErr : ('Final-URL: ' . $pageUrl),
            'debug' => [
                'finalUrl' => $pageUrl,
                'cookieKeys' => array_keys(cookie_names($cookies)),
                'curlError' => $pageErr !== '' ? $pageErr : null,
            ],
        ]);
    }

    $requestId = extract_request_id($pageBody, $pageUrl);
    if ($requestId === null) {
        @unlink($cookieFile);
        respond(401, [
            'ok' => false,
            'message' => 'Cookidoo-Loginformular konnte nicht gelesen werden (requestId fehlt).',
            'hint' => 'Vermutlich Captcha/Bot-Schutz oder geändertes Login-HTML.',
            'debug' => [
                'finalUrl' => $pageUrl,
                'cookieKeys' => array_keys(cookie_names($cookies)),
                'htmlSnippet' => substr(preg_replace('/\s+/', ' ', $pageBody), 0, 220),
            ],
        ]);
    }

    $setCookies = [];
    $ch = curl_init(CIAM_LOGIN_SRV);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'requestId' => $requestId,
            'username' => $email,
            'password' => $password,
        ]),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 20,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => [
            'User-Agent: ' . BROWSER_UA,
            'Accept-Language: de-DE,de;q=0.9,en;q=0.8',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: https://eu.login.vorwerk.com',
            'Referer: https://eu.login.vorwerk.com/ciam/login?requestId=' . rawurlencode($requestId)
                . '&view_type=login&market=' . rawurlencode($market) . '&ui_locales=' . rawurlencode($lang),
        ],
        CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$setCookies): int {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $setCookies[] = trim($header);
            }
            return strlen($header);
        },
    ]);
    $postBody = curl_exec($ch);
    $postStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $postUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $postErr = curl_error($ch);
    $listAfterPost = curl_getinfo($ch, CURLINFO_COOKIELIST);
    curl_close($ch);

    if (is_array($listAfterPost)) {
        $cookies = merge_cookies($cookies, cookies_from_cookielist($listAfterPost));
    }
    $cookies = merge_cookies(
        $cookies,
        parse_set_cookie_headers($setCookies, parse_url($postUrl, PHP_URL_HOST) ?: 'cookidoo.de')
    );
    @unlink($cookieFile);

    $names = cookie_names($cookies);
    $postRaw = is_string($postBody) ? $postBody : '';

    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        if (preg_match('#https?://[^"\'\s]+/oauth2/callback\?[^"\'\s]+#i', $postRaw . ' ' . $postUrl, $cm)) {
            $cb = html_entity_decode($cm[0]);
            $cbRes = http_cookied('GET', $cb, $cookies, [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ]);
            $cookies = $cbRes['cookies'];
            $names = cookie_names($cookies);
            $postUrl = $cbRes['url'];
            $postStatus = $cbRes['status'];
            $postRaw = $cbRes['raw'];
        }
    }

    if (!isset($names['_oauth2_proxy']) || !isset($names['v-authenticated'])) {
        $finalUrl = $postUrl;
        $badPass = stripos($finalUrl, 'invalid_username_password') !== false
            || stripos($postRaw, 'invalid_username_password') !== false
            || stripos($postRaw, 'username or password is invalid') !== false;
        $looksLikeLoginAgain = $badPass
            || stripos($finalUrl, 'login') !== false
            || stripos($postRaw, 'requestId') !== false;
        respond(401, [
            'ok' => false,
            'message' => $badPass
                ? 'Cookidoo: E-Mail oder Passwort ist falsch.'
                : ($looksLikeLoginAgain
                    ? 'Cookidoo-Login abgelehnt — E-Mail/Passwort prüfen.'
                    : 'Cookidoo-Session konnte nicht hergestellt werden.'),
            'hint' => $badPass
                ? 'Zugangsdaten wie auf cookidoo.de eingeben. Land muss zum Konto passen (meist DE).'
                : 'Session-Cookies fehlen nach OAuth-Callback. Bitte Land=DE prüfen und erneut versuchen.',
            'debug' => [
                'finalUrl' => $finalUrl !== '' ? preg_replace('/password=[^&]*/i', 'password=***', $finalUrl) : null,
                'status' => $postStatus,
                'cookieKeys' => array_keys($names),
                'market' => $market,
                'base' => $base,
                'badPassword' => $badPass,
                'curlError' => $postErr !== '' ? $postErr : null,
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
    // Search works with session cookies; the public catalogue endpoint is
    // https://cookidoo.{tld}/search/{locale}?query=...
    $cookies = session_cookies_from_input($input);
    $query = trim((string) ($input['query'] ?? ''));
    if ($query === '') {
        respond(400, ['ok' => false, 'message' => 'Suchbegriff fehlt.']);
    }

    $q = rawurlencode($query);
    $locale = search_locale($lang);
    $endpoints = [
        rtrim($base, '/') . "/search/{$locale}?query={$q}&pageSize=24",
        rtrim($base, '/') . "/search/{$locale}?query={$q}&size=24",
    ];

    $tried = [];
    foreach ($endpoints as $url) {
        $res = api_get($url, $cookies, 'application/json');
        $tried[] = [
            'url' => $url,
            'status' => $res['status'],
            'keys' => is_array($res['json']) ? array_keys($res['json']) : [],
        ];
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
        'message' => 'Keine Treffer — auf Cookidoo suchen und Link/ID hier importieren.',
        'recipes' => [],
        'hint' => 'Fallback: Rezept auf cookidoo.de öffnen, Link kopieren, unter „Link / ID“ einfügen.',
        'searchUrl' => rtrim($base, '/') . '/search?query=' . rawurlencode($query),
        'tried' => $tried,
    ]);
}

if ($action === 'lists') {
    $cookies = require_session($input);
    $lists = [];
    $acceptCustom = 'application/vnd.vorwerk.organize.custom-list.mobile+json, application/json';
    $acceptManaged = 'application/vnd.vorwerk.organize.managed-list.mobile+json, application/json';
    foreach ([
        [rtrim($base, '/') . "/organize/{$lang}/api/custom-list", $acceptCustom],
        [rtrim($base, '/') . "/organize/{$lang}/api/favorite", $acceptCustom],
        [rtrim($base, '/') . "/organize/{$lang}/api/managed-list", $acceptManaged],
    ] as [$url, $accept]) {
        $res = api_get($url, $cookies, $accept);
        if (!$res['ok'] || !is_array($res['json'])) {
            continue;
        }
        $raw = $res['json']['customLists']
            ?? $res['json']['managedLists']
            ?? $res['json']['lists']
            ?? $res['json']['favorites']
            ?? $res['json']['data']
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
