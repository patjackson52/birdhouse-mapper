import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track storage uploads and removals
let uploadedFiles: { bucket: string; path: string; contentType: string }[] = [];
let removedFiles: { bucket: string; paths: string[] }[] = [];
let uploadError: Error | null = null;
let removeError: Error | null = null;

// Track DB inserts and deletes
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];
let deletedRows: { table: string; id: string }[] = [];
let insertError: Error | null = null;
let deleteError: Error | null = null;

// Control quota data
let quotaData: { current_storage_bytes: number; max_storage_bytes: number } | null = {
  current_storage_bytes: 0,
  max_storage_bytes: 100 * 1024 * 1024,
};

// Control auth user
let authUser: { id: string } | null = { id: 'user-123' };

// Fake inserted item to return from .select().single()
let fakeInsertedItem: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: authUser },
          error: authUser ? null : new Error('Not authenticated'),
        })
      ),
    },
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn((path: string, _buffer: Buffer, opts: any) => {
          if (uploadError) return Promise.resolve({ error: uploadError });
          uploadedFiles.push({ bucket, path, contentType: opts?.contentType });
          return Promise.resolve({ error: null });
        }),
        remove: vi.fn((paths: string[]) => {
          if (removeError) return Promise.resolve({ error: removeError });
          removedFiles.push({ bucket, paths });
          return Promise.resolve({ error: null });
        }),
      }),
    },
    from: (table: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn((_col: string, _val: string) => ({
          single: vi.fn(() => {
            if (table === 'vault_quotas') {
              return Promise.resolve({ data: quotaData, error: null });
            }
            if (table === 'vault_items') {
              // For deleteFromVault — fetch item
              return Promise.resolve({
                data: { storage_bucket: 'vault-private', storage_path: 'org-1/item-1/file.pdf' },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      })),
      insert: vi.fn((payload: any) => {
        if (insertError) {
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: insertError })),
            })),
          };
        }
        insertedRows.push({ table, payload });
        fakeInsertedItem = Array.isArray(payload) ? payload[0] : payload;
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { ...fakeInsertedItem, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
                error: null,
              })
            ),
          })),
        };
      }),
      update: vi.fn((_payload: any) => ({
        eq: vi.fn((_col: string, _val: string) => Promise.resolve({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn((_col: string, _val: string) => {
          if (deleteError) return Promise.resolve({ error: deleteError });
          deletedRows.push({ table, id: _val });
          return Promise.resolve({ error: null });
        }),
      })),
    }),
  }),
}));

import { uploadToVault, deleteFromVault, updateVaultItem } from '../actions';

function makeInput(overrides: Partial<Parameters<typeof uploadToVault>[0]> = {}): Parameters<typeof uploadToVault>[0] {
  return {
    orgId: 'org-1',
    file: {
      name: 'test.pdf',
      type: 'application/pdf',
      size: 1024,
      base64: Buffer.from('fake file content').toString('base64'),
    },
    category: 'document',
    visibility: 'public',
    ...overrides,
  };
}

describe('uploadToVault', () => {
  beforeEach(() => {
    uploadedFiles = [];
    removedFiles = [];
    uploadError = null;
    removeError = null;
    insertedRows = [];
    deletedRows = [];
    insertError = null;
    deleteError = null;
    fakeInsertedItem = null;
    authUser = { id: 'user-123' };
    quotaData = { current_storage_bytes: 0, max_storage_bytes: 100 * 1024 * 1024 };
  });

  it('uploads a file and inserts a vault_items row', async () => {
    const result = await uploadToVault(makeInput());

    expect('success' in result && result.success).toBe(true);
    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0].bucket).toBe('vault-public');
    expect(uploadedFiles[0].path).toContain('org-1/');
    expect(uploadedFiles[0].path).toContain('/test.pdf');
    expect(uploadedFiles[0].contentType).toBe('application/pdf');

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('vault_items');
    expect(insertedRows[0].payload).toMatchObject({
      org_id: 'org-1',
      uploaded_by: 'user-123',
      file_name: 'test.pdf',
      category: 'document',
      visibility: 'public',
    });
  });

  it('rejects when quota exceeded', async () => {
    quotaData = { current_storage_bytes: 99 * 1024 * 1024, max_storage_bytes: 100 * 1024 * 1024 };
    const result = await uploadToVault(makeInput({ file: { name: 'big.pdf', type: 'application/pdf', size: 5 * 1024 * 1024, base64: '' } }));

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toContain('Storage limit reached');
    expect(uploadedFiles).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
  });

  it('uses vault-private bucket for private visibility', async () => {
    await uploadToVault(makeInput({ visibility: 'private' }));

    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0].bucket).toBe('vault-private');
    expect(insertedRows[0].payload).toMatchObject({ storage_bucket: 'vault-private', visibility: 'private' });
  });

  it('returns error on storage failure', async () => {
    uploadError = new Error('Disk full');
    const result = await uploadToVault(makeInput());

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toContain('Failed to upload file');
    expect((result as { error: string }).error).toContain('Disk full');
    expect(insertedRows).toHaveLength(0);
  });

  it('auth failure returns not authenticated error', async () => {
    authUser = null;
    const result = await uploadToVault(makeInput());

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
    expect(uploadedFiles).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
  });

  it('sets isAiContext and aiPriority on inserted row', async () => {
    const result = await uploadToVault(makeInput({ isAiContext: true, aiPriority: 5 }));

    expect('success' in result && result.success).toBe(true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].payload).toMatchObject({
      is_ai_context: true,
      ai_priority: 5,
    });
  });

  it('returns error on DB insert failure (upload still occurs)', async () => {
    insertError = new Error('DB constraint violated');
    const result = await uploadToVault(makeInput());

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toContain('Failed to create vault item');
    // Upload happens before the insert, so the file was uploaded
    expect(uploadedFiles).toHaveLength(1);
  });
});

describe('deleteFromVault', () => {
  beforeEach(() => {
    uploadedFiles = [];
    removedFiles = [];
    uploadError = null;
    removeError = null;
    insertedRows = [];
    deletedRows = [];
    insertError = null;
    deleteError = null;
    authUser = { id: 'user-123' };
    quotaData = { current_storage_bytes: 0, max_storage_bytes: 100 * 1024 * 1024 };
  });

  it('deletes storage file and DB row', async () => {
    const result = await deleteFromVault('item-abc');

    expect('success' in result && result.success).toBe(true);
    expect(removedFiles).toHaveLength(1);
    expect(removedFiles[0].bucket).toBe('vault-private');
    expect(removedFiles[0].paths).toContain('org-1/item-1/file.pdf');
    expect(deletedRows).toHaveLength(1);
    expect(deletedRows[0].table).toBe('vault_items');
  });

  it('auth failure returns not authenticated error', async () => {
    authUser = null;
    const result = await deleteFromVault('item-abc');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
    expect(removedFiles).toHaveLength(0);
    expect(deletedRows).toHaveLength(0);
  });

  it('returns error on storage removal failure', async () => {
    removeError = new Error('Permission denied');
    const result = await deleteFromVault('item-abc');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toContain('Failed to delete file');
    expect((result as { error: string }).error).toContain('Permission denied');
    expect(deletedRows).toHaveLength(0);
  });
});

describe('updateVaultItem', () => {
  beforeEach(() => {
    authUser = { id: 'user-123' };
  });

  it('successfully updates a vault item', async () => {
    const result = await updateVaultItem('item-abc', { file_name: 'renamed.pdf', is_ai_context: true });

    expect('success' in result && result.success).toBe(true);
  });

  it('auth failure returns not authenticated error', async () => {
    authUser = null;
    const result = await updateVaultItem('item-abc', { file_name: 'renamed.pdf' });

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
  });
});
