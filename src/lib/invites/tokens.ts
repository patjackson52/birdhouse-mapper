import { randomBytes, createHash } from 'crypto';

/**
 * Generate a cryptographically random, URL-safe invite token.
 * 32 bytes = 256 bits of entropy.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hash a raw token for storage.
 * The raw token only exists in the invite URL — we store the hash.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
