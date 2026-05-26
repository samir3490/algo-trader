<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

// ===== CONFIGURATION =====
$PROXY_SECRET = 'xK9m$2pLq!7nRv4W';
// ==========================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Proxy-Secret');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Only POST requests allowed']);
    exit;
}

// Verify the shared secret
$receivedSecret = $_SERVER['HTTP_X_PROXY_SECRET'] ?? '';
if ($receivedSecret !== $PROXY_SECRET) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$action = $input['action'] ?? '';
$apiKey = $input['api_key'] ?? '';
$accessToken = $input['access_token'] ?? '';

if (!$apiKey || !$accessToken) {
    http_response_code(400);
    echo json_encode(['error' => 'api_key and access_token are required']);
    exit;
}

$baseUrl = 'https://api.kite.trade';
$authHeader = "Authorization: token {$apiKey}:{$accessToken}";

try {
    switch ($action) {
        case 'place_order':
            $variety = $input['variety'] ?? 'regular';
            $params = $input['params'] ?? [];
            $result = kitePost("{$baseUrl}/orders/{$variety}", $params, $authHeader);
            echo json_encode($result);
            break;

        case 'modify_order':
            $variety = $input['variety'] ?? 'regular';
            $orderId = $input['order_id'] ?? '';
            $params = $input['params'] ?? [];
            $result = kitePut("{$baseUrl}/orders/{$variety}/{$orderId}", $params, $authHeader);
            echo json_encode($result);
            break;

        case 'cancel_order':
            $variety = $input['variety'] ?? 'regular';
            $orderId = $input['order_id'] ?? '';
            $result = kiteDelete("{$baseUrl}/orders/{$variety}/{$orderId}", $authHeader);
            echo json_encode($result);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: {$action}"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function kitePost($url, $params, $authHeader) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            $authHeader,
            'Content-Type: application/x-www-form-urlencoded',
            'X-Kite-Version: 3',
        ],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        throw new Exception('cURL error: ' . curl_error($ch));
    }
    curl_close($ch);

    $decoded = json_decode($response, true);
    if ($httpCode >= 400) {
        http_response_code($httpCode);
    }
    return $decoded ?: ['raw_response' => $response, 'http_code' => $httpCode];
}

function kitePut($url, $params, $authHeader) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_POSTFIELDS => http_build_query($params),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            $authHeader,
            'Content-Type: application/x-www-form-urlencoded',
            'X-Kite-Version: 3',
        ],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        throw new Exception('cURL error: ' . curl_error($ch));
    }
    curl_close($ch);

    $decoded = json_decode($response, true);
    if ($httpCode >= 400) {
        http_response_code($httpCode);
    }
    return $decoded ?: ['raw_response' => $response, 'http_code' => $httpCode];
}

function kiteDelete($url, $authHeader) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'DELETE',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            $authHeader,
            'X-Kite-Version: 3',
        ],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        throw new Exception('cURL error: ' . curl_error($ch));
    }
    curl_close($ch);

    $decoded = json_decode($response, true);
    if ($httpCode >= 400) {
        http_response_code($httpCode);
    }
    return $decoded ?: ['raw_response' => $response, 'http_code' => $httpCode];
}
