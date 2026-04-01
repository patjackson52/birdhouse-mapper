import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track storage uploads
let uploadedFiles: { path: string; contentType: string }[] = [];
let uploadError: Error | null = null;

// Track DB updates
let updatedTable = '';
let updatedPayload: Record<string, unknown> = {};
let updateError: Error | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn((path: string, _buffer: Buffer, opts: any) => {
          if (uploadError) return Promise.resolve({ error: uploadError });
          uploadedFiles.push({ path, contentType: opts?.contentType });
          return Promise.resolve({ error: null });
        }),
      }),
    },
    from: (table: string) => ({
      update: vi.fn((payload: any) => {
        updatedTable = table;
        updatedPayload = payload;
        return {
          eq: vi.fn(() => Promise.resolve({ error: updateError })),
        };
      }),
    }),
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: () => Promise.resolve({ orgId: 'test-org-id' }),
}));

// Mock sharp — return a minimal buffer for each variant
vi.mock('sharp', () => {
  const mockSharp = () => {
    const chain: any = {
      resize: vi.fn(() => chain),
      extend: vi.fn(() => chain),
      png: vi.fn(() => chain),
      toBuffer: vi.fn(() => Promise.resolve(Buffer.from('fake-image'))),
    };
    return chain;
  };
  return { default: mockSharp };
});

import { uploadLogo } from '../logo-actions';

function makeFormData(content = 'test-image', type = 'image/png', name = 'logo.png', size?: number) {
  const blob = new Blob([content], { type });
  Object.defineProperty(blob, 'size', { value: size ?? content.length });
  const formData = new FormData();
  formData.set('logo', blob, name);
  return formData;
}

describe('uploadLogo', () => {
  beforeEach(() => {
    uploadedFiles = [];
    uploadError = null;
    updatedTable = '';
    updatedPayload = {};
    updateError = null;
  });

  it('returns error when no file provided', async () => {
    const result = await uploadLogo(new FormData(), 'org');
    expect(result.error).toBe('No file provided');
  });

  it('returns error for non-image files', async () => {
    const formData = new FormData();
    formData.set('logo', new Blob(['text'], { type: 'text/plain' }), 'file.txt');
    const result = await uploadLogo(formData, 'org');
    expect(result.error).toBe('File must be an image');
  });

  it('returns error for oversized files', async () => {
    // Create a blob that reports a large size
    const bigContent = new Uint8Array(6 * 1024 * 1024);
    const formData = new FormData();
    formData.set('logo', new File([bigContent], 'big.png', { type: 'image/png' }));
    const result = await uploadLogo(formData, 'org');
    expect(result.error).toBe('Image must be under 5MB');
  });

  it('uploads 5 variants for org scope', async () => {
    const result = await uploadLogo(makeFormData(), 'org');

    expect(result.success).toBe(true);
    expect(result.basePath).toBe('test-org-id');
    expect(uploadedFiles).toHaveLength(5);

    const paths = uploadedFiles.map((f) => f.path);
    expect(paths).toContain('test-org-id/original.png');
    expect(paths).toContain('test-org-id/icon-192.png');
    expect(paths).toContain('test-org-id/icon-512.png');
    expect(paths).toContain('test-org-id/icon-512-maskable.png');
    expect(paths).toContain('test-org-id/favicon-32.png');
  });

  it('all uploads use image/png content type', async () => {
    await uploadLogo(makeFormData(), 'org');
    for (const file of uploadedFiles) {
      expect(file.contentType).toBe('image/png');
    }
  });

  it('updates orgs table for org scope', async () => {
    await uploadLogo(makeFormData(), 'org');
    expect(updatedTable).toBe('orgs');
    expect(updatedPayload).toEqual({ logo_url: 'test-org-id' });
  });

  it('uses property path and updates properties table for property scope', async () => {
    const result = await uploadLogo(makeFormData(), 'property', 'prop-456');

    expect(result.basePath).toBe('test-org-id/prop-456');
    expect(updatedTable).toBe('properties');
    expect(updatedPayload).toEqual({ logo_url: 'test-org-id/prop-456' });

    const paths = uploadedFiles.map((f) => f.path);
    expect(paths).toContain('test-org-id/prop-456/original.png');
    expect(paths).toContain('test-org-id/prop-456/icon-192.png');
  });

  it('returns error when storage upload fails', async () => {
    uploadError = new Error('Storage full');
    const result = await uploadLogo(makeFormData(), 'org');
    expect(result.error).toContain('Failed to upload');
    expect(result.error).toContain('Storage full');
  });

  it('returns error when DB update fails', async () => {
    updateError = new Error('DB error');
    const result = await uploadLogo(makeFormData(), 'org');
    expect(result.error).toBe('DB error');
  });
});
