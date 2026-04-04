import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isGooglePhotosConfigured } from '@/lib/google/picker';

describe('isGooglePhotosConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns true when client ID is set', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
    expect(isGooglePhotosConfigured()).toBe(true);
  });

  it('returns false when client ID is missing', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '';
    expect(isGooglePhotosConfigured()).toBe(false);
  });

  it('returns false when client ID is undefined', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    expect(isGooglePhotosConfigured()).toBe(false);
  });
});
