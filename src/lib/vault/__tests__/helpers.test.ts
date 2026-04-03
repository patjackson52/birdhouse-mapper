import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable flag to simulate signed URL errors
let signedUrlError: Error | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://storage.example.com/${bucket}/${path}` },
        })),
        createSignedUrl: vi.fn((path: string, expiresIn: number) => {
          if (signedUrlError) {
            return Promise.resolve({ data: null, error: signedUrlError });
          }
          return Promise.resolve({
            data: { signedUrl: `https://storage.example.com/${bucket}/${path}?token=signed&expires=${expiresIn}` },
            error: null,
          });
        }),
      }),
    },
  }),
}));

import { getVaultUrl, formatBytes } from '../helpers';
import type { VaultItem } from '../types';

function makeItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    org_id: 'org-1',
    uploaded_by: 'user-1',
    storage_bucket: 'vault-public',
    storage_path: 'org-1/item-1/photo.jpg',
    file_name: 'photo.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    category: 'photo',
    visibility: 'public',
    is_ai_context: false,
    ai_priority: null,
    metadata: {},
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes below 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1610612736)).toBe('1.5 GB');
  });
});

describe('getVaultUrl', () => {
  beforeEach(() => {
    signedUrlError = null;
  });

  it('returns public URL for public items', () => {
    const item = makeItem({ visibility: 'public', storage_bucket: 'vault-public' });
    const url = getVaultUrl(item);
    expect(url).toBe('https://storage.example.com/vault-public/org-1/item-1/photo.jpg');
  });

  it('returns signed URL for private items', async () => {
    const item = makeItem({
      visibility: 'private',
      storage_bucket: 'vault-private',
      storage_path: 'org-1/item-1/doc.pdf',
    });
    const url = await getVaultUrl(item);
    expect(url).toContain('vault-private');
    expect(url).toContain('token=signed');
  });

  it('rejects with error message when signed URL creation fails', async () => {
    signedUrlError = new Error('Unauthorized');
    const item = makeItem({
      visibility: 'private',
      storage_bucket: 'vault-private',
      storage_path: 'org-1/item-1/doc.pdf',
    });
    await expect(getVaultUrl(item)).rejects.toThrow('Failed to create signed URL: Unauthorized');
  });
});
