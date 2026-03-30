import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isGooglePhotosConfigured } from '@/lib/google/picker';

describe('isGooglePhotosConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns true when both env vars are set', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = 'test-api-key';
    expect(isGooglePhotosConfigured()).toBe(true);
  });

  it('returns false when client ID is missing', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = 'test-api-key';
    expect(isGooglePhotosConfigured()).toBe(false);
  });

  it('returns false when API key is missing', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = '';
    expect(isGooglePhotosConfigured()).toBe(false);
  });

  it('returns false when both are missing', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    expect(isGooglePhotosConfigured()).toBe(false);
  });
});
