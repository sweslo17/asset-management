/**
 * Google Service Account authentication for Cloudflare Workers.
 *
 * Uses the Web Crypto API (crypto.subtle) exclusively — no Node.js built-ins.
 * Implements the standard JWT Bearer flow described at:
 * https://developers.google.com/identity/protocols/oauth2/service-account
 */

import type {
  CachedToken,
  Env,
  ServiceAccountCredentials,
  TokenResponse,
} from './types';

// ---------------------------------------------------------------------------
// Module-level token cache (lives for the lifetime of a Worker isolate).
// ---------------------------------------------------------------------------

let cachedToken: CachedToken | null = null;

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Base64url-encodes a Uint8Array without padding, as required by RFC 7515.
 */
function base64urlEncode(data: Uint8Array): string {
  // Convert to a regular base64 string first.
  // Use Array.from to get a proper number[] so we avoid noUncheckedIndexedAccess
  // issues and can safely spread into String.fromCharCode.
  const chars = Array.from(data);
  const base64 = btoa(String.fromCharCode(...chars));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Encodes a plain-text string as base64url.
 */
function base64urlEncodeString(value: string): string {
  const encoder = new TextEncoder();
  return base64urlEncode(encoder.encode(value));
}

/**
 * Strips the PEM header/footer lines and whitespace, then decodes the
 * remaining base64 body into a Uint8Array suitable for `crypto.subtle.importKey`.
 */
function pemToDer(pem: string): Uint8Array {
  const lines = pem
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('-----'));

  const base64 = lines.join('');
  const binary = atob(base64);
  // Uint8Array.from with a map function avoids noUncheckedIndexedAccess on
  // individual character code accesses.
  return Uint8Array.from({ length: binary.length }, (_, i) =>
    // charCodeAt is always a valid number for in-bounds indices.
    binary.charCodeAt(i),
  );
}

/**
 * Imports an RSA-SHA256 private key from a PKCS#8 PEM string using the
 * Web Crypto API so it can be used with `crypto.subtle.sign`.
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const der = pemToDer(pemKey);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false, // not extractable
    ['sign'],
  );
}

/**
 * Builds and signs a Google-compatible JWT assertion.
 *
 * @param credentials - Parsed service account credentials.
 * @param nowSeconds  - Current time as Unix timestamp in seconds.
 * @returns A signed JWT string in the format `header.payload.signature`.
 */
async function buildJwt(
  credentials: ServiceAccountCredentials,
  nowSeconds: number,
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.private_key_id,
  };

  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
  };

  const encodedHeader = base64urlEncodeString(JSON.stringify(header));
  const encodedPayload = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importPrivateKey(credentials.private_key);

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(signingInput),
  );

  const signature = base64urlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signature}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid Google OAuth2 access token for the Sheets API scope.
 *
 * Tokens are cached in module-level state for the lifetime of the isolate.
 * The cache is invalidated 60 seconds before the token actually expires to
 * guard against clock skew between the Worker and Google's servers.
 *
 * @param env - Worker environment bindings containing the service account JSON.
 * @returns A Bearer access token string.
 */
export async function getAccessToken(env: Env): Promise<string> {
  const nowMs = Date.now();
  const bufferMs = 60_000; // 60-second safety buffer

  if (cachedToken !== null && nowMs < cachedToken.expires_at - bufferMs) {
    return cachedToken.access_token;
  }

  const credentials: ServiceAccountCredentials = JSON.parse(
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
  );

  const nowSeconds = Math.floor(nowMs / 1000);
  const jwt = await buildJwt(credentials, nowSeconds);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(
      `Failed to obtain access token (HTTP ${tokenResponse.status}): ${errorBody}`,
    );
  }

  const tokenData: TokenResponse = await tokenResponse.json();

  cachedToken = {
    access_token: tokenData.access_token,
    // expires_in is in seconds; convert to an absolute millisecond timestamp.
    expires_at: nowMs + tokenData.expires_in * 1000,
  };

  return cachedToken.access_token;
}

/**
 * Clears the in-memory token cache.
 * Useful in tests or when a 401 response is received from the Sheets API.
 */
export function invalidateTokenCache(): void {
  cachedToken = null;
}
