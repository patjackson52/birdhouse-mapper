import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from '../tokens';

describe('generateToken', () => {
  it('returns a URL-safe base64 string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns a string of ~43 characters (32 bytes base64url)', () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token.length).toBeLessThanOrEqual(44);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('returns a hex string', () => {
    const hash = hashToken('test-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});
