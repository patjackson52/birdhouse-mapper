import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/${bucket}/${path}` },
        }),
      }),
    },
  }),
}));

import { getLogoUrl } from '../logo';

describe('getLogoUrl', () => {
  it('returns default logo path when basePath is null', () => {
    expect(getLogoUrl(null, 'original.png')).toBe('/defaults/logos/fieldmapper.png');
  });

  it('returns default logo path when basePath is null regardless of variant', () => {
    expect(getLogoUrl(null, 'icon-192.png')).toBe('/defaults/logos/fieldmapper.png');
    expect(getLogoUrl(null, 'favicon-32.png')).toBe('/defaults/logos/fieldmapper.png');
  });

  it('builds storage URL for org logo with variant', () => {
    const url = getLogoUrl('org-123', 'icon-192.png');
    expect(url).toBe('https://storage.test/branding/org-123/icon-192.png');
  });

  it('builds storage URL for property logo with variant', () => {
    const url = getLogoUrl('org-123/prop-456', 'icon-512.png');
    expect(url).toBe('https://storage.test/branding/org-123/prop-456/icon-512.png');
  });

  it('builds storage URL for original variant', () => {
    const url = getLogoUrl('org-123', 'original.png');
    expect(url).toBe('https://storage.test/branding/org-123/original.png');
  });

  it('builds storage URL for maskable variant', () => {
    const url = getLogoUrl('org-123', 'icon-512-maskable.png');
    expect(url).toBe('https://storage.test/branding/org-123/icon-512-maskable.png');
  });
});
