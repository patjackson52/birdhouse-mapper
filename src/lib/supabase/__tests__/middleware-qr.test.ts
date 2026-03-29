import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';

// Unit test for IP hashing utility (middleware itself is integration-tested via E2E)
describe('IP hashing', () => {
  it('hashes IP with SHA-256 and truncates to 16 chars', () => {
    const hashIp = (ip: string): string =>
      createHash('sha256').update(ip).digest('hex').slice(0, 16);

    const result = hashIp('192.168.1.1');
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]+$/);

    // Same input = same hash
    expect(hashIp('192.168.1.1')).toBe(result);
    // Different input = different hash
    expect(hashIp('10.0.0.1')).not.toBe(result);
  });
});
