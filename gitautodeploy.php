<?php
declare(strict_types=1);

/**
 * Hardened GitHub -> Cloudways auto deploy webhook
 *
 * What it does:
 * - Accepts only POST requests
 * - Verifies GitHub HMAC signature (X-Hub-Signature-256)
 * - Accepts only push events
 * - Accepts only pushes to refs/heads/main
 * - Uses environment variables for sensitive values
 * - Hardcodes Cloudways app/branch values
 * - Calls Cloudways API to trigger /git/pull
 * - Logs activity to a local file
 *
 * IMPORTANT:
 * 1) Set the required environment variables on the server.
 * 2) Set the same WEBHOOK_SECRET in GitHub webhook settings.
 * 3) Make sure this file is publicly reachable by GitHub.
 */

// =========================
// Configuration
// =========================
const API_URL         = 'https://api.cloudways.com/api/v2';

// Hardcoded deployment target
const SERVER_ID       = 1156790;
const APP_ID          = 6283574;
const GIT_URL         = 'git@github.com:CCI-Cloud/Quote-Builder-Middleware.git';
const BRANCH_NAME     = 'main';
const EXPECTED_REF    = 'refs/heads/main';
const EXPECTED_REPO   = 'CCI-Cloud/Quote-Builder-Middleware';

// Logging
const LOG_FILE        = __DIR__ . '/gitautodeploy.log';

// =========================
// Helpers
// =========================
function logMessage(string $level, string $message, array $context = []): void
{
    $entry = [
        'time'    => date('c'),
        'level'   => $level,
        'message' => $message,
        'context' => $context,
        'ip'      => $_SERVER['REMOTE_ADDR'] ?? null,
        'ua'      => $_SERVER['HTTP_USER_AGENT'] ?? null,
    ];

    @file_put_contents(
        LOG_FILE,
        json_encode($entry, JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

function getRequiredEnv(string $name): string
{
    $value = getenv($name);
    if (!is_string($value) || trim($value) === '') {
        throw new RuntimeException('Missing required environment variable: ' . $name);
    }

    return $value;
}

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function requirePost(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        logMessage('warning', 'Rejected non-POST request');
        respond(405, ['ok' => false, 'error' => 'Method Not Allowed']);
    }
}

function getRawPayload(): string
{
    $payload = file_get_contents('php://input');
    if ($payload === false) {
        logMessage('error', 'Unable to read request body');
        respond(400, ['ok' => false, 'error' => 'Unable to read payload']);
    }
    return $payload;
}

function verifyGitHubSignature(string $payload): void
{
    $webhookSecret = getRequiredEnv('WEBHOOK_SECRET');
    $signatureHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
    if ($signatureHeader === '') {
        logMessage('warning', 'Missing GitHub signature header');
        respond(403, ['ok' => false, 'error' => 'Missing signature']);
    }

    if (!str_starts_with($signatureHeader, 'sha256=')) {
        logMessage('warning', 'Malformed GitHub signature header', ['header' => $signatureHeader]);
        respond(403, ['ok' => false, 'error' => 'Invalid signature format']);
    }

    $providedHash = substr($signatureHeader, 7);
    $expectedHash = hash_hmac('sha256', $payload, $webhookSecret);

    if (!hash_equals($expectedHash, $providedHash)) {
        logMessage('warning', 'GitHub signature verification failed');
        respond(403, ['ok' => false, 'error' => 'Invalid signature']);
    }
}

function requireGitHubPushEvent(): void
{
    $event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
    if ($event !== 'push') {
        logMessage('info', 'Ignoring non-push event', ['event' => $event]);
        respond(202, ['ok' => true, 'message' => 'Ignored non-push event']);
    }
}

function parseJsonPayload(string $payload): array
{
    try {
        $data = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        logMessage('error', 'Invalid JSON payload', ['exception' => $e->getMessage()]);
        respond(400, ['ok' => false, 'error' => 'Invalid JSON payload']);
    }

    if (!is_array($data)) {
        logMessage('error', 'Unexpected payload structure');
        respond(400, ['ok' => false, 'error' => 'Unexpected payload structure']);
    }

    return $data;
}

function requireExpectedRef(array $data): void
{
    $ref = $data['ref'] ?? '';
    if ($ref !== EXPECTED_REF) {
        logMessage('info', 'Ignoring push to non-target branch', ['ref' => $ref]);
        respond(202, ['ok' => true, 'message' => 'Ignored non-target push', 'ref' => $ref]);
    }
}

function requireExpectedRepo(array $data): void
{
    $fullName = $data['repository']['full_name'] ?? '';
    if ($fullName !== EXPECTED_REPO) {
        logMessage('warning', 'Unexpected repository', ['repository' => $fullName]);
        respond(403, ['ok' => false, 'error' => 'Unexpected repository']);
    }
}

function callCloudwaysAPI(string $method, string $url, ?string $accessToken = null, array $postFields = []): array
{
    $ch = curl_init();

    if ($ch === false) {
        throw new RuntimeException('Failed to initialize cURL');
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_URL            => API_URL . $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    $headers = ['Accept: application/json'];

    if ($accessToken !== null) {
        $headers[] = 'Authorization: Bearer ' . $accessToken;
    }

    if (!empty($postFields)) {
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postFields));
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $responseBody = curl_exec($ch);
    $curlError    = curl_error($ch);
    $httpCode     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($responseBody === false) {
        throw new RuntimeException('Cloudways API request failed: ' . $curlError);
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        throw new RuntimeException(
            'Cloudways API returned HTTP ' . $httpCode . ': ' . substr($responseBody, 0, 2000)
        );
    }

    try {
        $decoded = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        throw new RuntimeException('Cloudways API returned invalid JSON: ' . $e->getMessage());
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Cloudways API returned unexpected response structure');
    }

    return $decoded;
}

function fetchAccessToken(): string
{
    $email = getRequiredEnv('CLOUDWAYS_EMAIL');
    $apiKey = getRequiredEnv('CLOUDWAYS_API_KEY');

    $tokenResponse = callCloudwaysAPI('POST', '/oauth/access_token', null, [
        'email'   => $email,
        'api_key' => $apiKey,
    ]);

    $token = $tokenResponse['access_token'] ?? '';
    if ($token === '') {
        throw new RuntimeException('Cloudways token missing from response');
    }

    return $token;
}

function triggerGitPull(string $accessToken): array
{
    return callCloudwaysAPI('POST', '/git/pull', $accessToken, [
        'server_id'   => SERVER_ID,
        'app_id'      => APP_ID,
        'git_url'     => GIT_URL,
        'branch_name' => BRANCH_NAME,
    ]);
}

// =========================
// Main
// =========================
try {
    requirePost();

    $payload = getRawPayload();
    verifyGitHubSignature($payload);
    requireGitHubPushEvent();

    $data = parseJsonPayload($payload);
    requireExpectedRepo($data);
    requireExpectedRef($data);

    $deliveryId = $_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? null;
    $commit     = $data['after'] ?? null;
    $pusher     = $data['pusher']['name'] ?? null;

    logMessage('info', 'Valid target push received', [
        'delivery_id' => $deliveryId,
        'commit'      => $commit,
        'pusher'      => $pusher,
        'ref'         => $data['ref'] ?? null,
    ]);

    $accessToken = fetchAccessToken();
    $gitPullResponse = triggerGitPull($accessToken);

    logMessage('info', 'Cloudways git pull triggered successfully', [
        'delivery_id' => $deliveryId,
        'commit'      => $commit,
        'response'    => $gitPullResponse,
    ]);

    respond(200, [
        'ok'          => true,
        'message'     => 'Deployment triggered',
        'delivery_id' => $deliveryId,
        'commit'      => $commit,
        'branch'      => BRANCH_NAME,
        'cloudways'   => $gitPullResponse,
    ]);
} catch (Throwable $e) {
    logMessage('error', 'Deployment failed', [
        'error' => $e->getMessage(),
    ]);

    respond(500, [
        'ok'    => false,
        'error' => 'Deployment failed',
    ]);
}