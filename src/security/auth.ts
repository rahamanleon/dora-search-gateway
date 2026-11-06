import crypto from 'node:crypto';

/**
 * Validates authorization bearer token or x-api-key using timing-safe comparison.
 */
export function validateAuthToken(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined
): boolean {
  if (!expectedSecret) {
    // If no secret configured, fail-safe closed
    return false;
  }

  if (!providedToken) {
    return false;
  }

  const cleanProvided = providedToken.startsWith('Bearer ')
    ? providedToken.slice(7).trim()
    : providedToken.trim();

  const cleanExpected = expectedSecret.trim();

  if (cleanProvided.length === 0 || cleanExpected.length === 0) {
    return false;
  }

  // Ensure buffers of equal length for crypto.timingSafeEqual
  const bufProvided = Buffer.from(cleanProvided);
  const bufExpected = Buffer.from(cleanExpected);

  if (bufProvided.length !== bufExpected.length) {
    // Run dummy timing comparison to prevent timing leak on length
    crypto.timingSafeEqual(bufExpected, bufExpected);
    return false;
  }

  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

/**
 * Extracts authentication token from headers.
 */
export function extractTokenFromHeaders(headers: Headers | Record<string, string | string[] | undefined>): string | null {
  if (headers instanceof Headers) {
    const auth = headers.get('authorization') || headers.get('x-api-key');
    return auth || null;
  }

  const auth = headers['authorization'] || headers['x-api-key'];
  if (Array.isArray(auth)) {
    return auth[0] || null;
  }
  return auth || null;
}

