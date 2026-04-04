import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isGooglePhotosConfigured, getGooglePhotosPickerUrl } from '@/lib/google/picker';

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

describe('getGooglePhotosPickerUrl', () => {
  const originalWindow = globalThis.window;

  function mockHostname(hostname: string) {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { hostname } },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('returns relative path on localhost', () => {
    mockHostname('localhost');
    expect(getGooglePhotosPickerUrl(5, 'fieldmapper.org')).toBe('/google-photos-picker?maxFiles=5');
  });

  it('returns relative path on 127.0.0.1', () => {
    mockHostname('127.0.0.1');
    expect(getGooglePhotosPickerUrl(3, 'fieldmapper.org')).toBe('/google-photos-picker?maxFiles=3');
  });

  it('returns relative path when on the platform domain', () => {
    mockHostname('fieldmapper.org');
    expect(getGooglePhotosPickerUrl(5, 'fieldmapper.org')).toBe('/google-photos-picker?maxFiles=5');
  });

  it('returns relative path on Vercel preview URLs', () => {
    mockHostname('birdhouse-mapper-abc123.vercel.app');
    expect(getGooglePhotosPickerUrl(5, 'birdhouse-mapper.vercel.app')).toBe('/google-photos-picker?maxFiles=5');
  });

  it('returns platform domain URL for custom domains', () => {
    mockHostname('fairbankseagle.org');
    expect(getGooglePhotosPickerUrl(5, 'fieldmapper.org')).toBe('https://fieldmapper.org/google-photos-picker?maxFiles=5');
  });

  it('returns relative path when platformDomain is null', () => {
    mockHostname('example.com');
    expect(getGooglePhotosPickerUrl(5, null)).toBe('/google-photos-picker?maxFiles=5');
  });

  it('uses http protocol for localhost platform domain', () => {
    mockHostname('fairbankseagle.org');
    expect(getGooglePhotosPickerUrl(5, 'localhost:3000')).toBe('http://localhost:3000/google-photos-picker?maxFiles=5');
  });
});
