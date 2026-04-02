import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
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

import { getLogoUrlServer } from '../logo-server';

describe('getLogoUrlServer', () => {
  it('returns variant-specific default when basePath is null', () => {
    expect(getLogoUrlServer(null, 'icon-192.png')).toBe('/defaults/logos/icon-192.png');
    expect(getLogoUrlServer(null, 'icon-512.png')).toBe('/defaults/logos/icon-512.png');
    expect(getLogoUrlServer(null, 'icon-512-maskable.png')).toBe('/defaults/logos/icon-512-maskable.png');
    expect(getLogoUrlServer(null, 'favicon-32.png')).toBe('/defaults/logos/favicon-32.png');
    expect(getLogoUrlServer(null, 'original.png')).toBe('/defaults/logos/fieldmapper.png');
  });

  it('builds storage URL for org logo with variant', () => {
    const url = getLogoUrlServer('org-123', 'icon-192.png');
    expect(url).toBe('https://storage.test/vault-public/org-123/icon-192.png');
  });

  it('builds storage URL for property logo with variant', () => {
    const url = getLogoUrlServer('org-123/prop-456', 'icon-512-maskable.png');
    expect(url).toBe('https://storage.test/vault-public/org-123/prop-456/icon-512-maskable.png');
  });
});
