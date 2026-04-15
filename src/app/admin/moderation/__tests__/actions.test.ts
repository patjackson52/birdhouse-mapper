import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control auth user
let authUser: { id: string } | null = { id: 'admin-user-1' };

// Control tenant context
let tenantOrgId: string | null = 'org-1';

// Track DB operations
let updatedRows: { table: string; payload: Record<string, unknown> }[] = [];
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];
let updateError: Error | null = null;

// Track storage operations
let uploadedFiles: { bucket: string; path: string }[] = [];
let removedFiles: { bucket: string; paths: string[] }[] = [];

// Control vault_items fetch result
let vaultItemData: Record<string, unknown> | null = {
  id: 'item-1',
  org_id: 'org-1',
  uploaded_by: 'user-contributor-1',
  storage_bucket: 'vault-private',
  storage_path: 'org-1/item-1/photo.jpg',
  mime_type: 'image/jpeg',
};
let vaultItemFetchError: Error | null = null;

// Control list query result (getPendingItems)
let pendingItemsData: Record<string, unknown>[] = [
  { id: 'item-1', moderation_status: 'pending' },
  { id: 'item-2', moderation_status: 'flagged_for_review' },
];
let pendingItemsError: Error | null = null;

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
        download: vi.fn((_path: string) => {
          const fakeData = {
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
          };
          return Promise.resolve({ data: fakeData, error: null });
        }),
        upload: vi.fn((path: string, _buf: Uint8Array, _opts: unknown) => {
          uploadedFiles.push({ bucket, path });
          return Promise.resolve({ error: null });
        }),
        remove: vi.fn((paths: string[]) => {
          removedFiles.push({ bucket, paths });
          return Promise.resolve({ error: null });
        }),
      }),
    },
    from: (table: string) => ({
      select: vi.fn((_cols: string) => ({
        // chained for getPendingItems: .eq().in().order()
        eq: vi.fn((_col: string, _val: string) => ({
          in: vi.fn((_col2: string, _vals: string[]) => ({
            order: vi.fn((_col3: string, _opts: unknown) => {
              if (pendingItemsError) return Promise.resolve({ data: null, error: pendingItemsError });
              return Promise.resolve({ data: pendingItemsData, error: null });
            }),
          })),
          // chained for approveItem/rejectItem: .eq().single()
          single: vi.fn(() => {
            if (vaultItemFetchError) return Promise.resolve({ data: null, error: vaultItemFetchError });
            return Promise.resolve({ data: vaultItemData, error: null });
          }),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn((_col: string, _val: string) => {
          // Return object supporting chained .eq() for banContributor
          const result = {
            eq: vi.fn((_col2: string, _val2: string) => {
              if (updateError) return Promise.resolve({ error: updateError });
              updatedRows.push({ table, payload });
              return Promise.resolve({ error: null });
            }),
            then: (resolve: (v: { error: null | Error }) => void) => {
              if (updateError) return resolve({ error: updateError });
              updatedRows.push({ table, payload });
              return resolve({ error: null });
            },
          };
          return result;
        }),
      })),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertedRows.push({ table, payload });
        return Promise.resolve({ error: null });
      }),
    }),
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: vi.fn(() =>
    Promise.resolve({ orgId: tenantOrgId })
  ),
}));

import { getPendingItems, approveItem, rejectItem, banContributor } from '../actions';

function resetState() {
  authUser = { id: 'admin-user-1' };
  tenantOrgId = 'org-1';
  updatedRows = [];
  insertedRows = [];
  updateError = null;
  uploadedFiles = [];
  removedFiles = [];
  vaultItemData = {
    id: 'item-1',
    org_id: 'org-1',
    uploaded_by: 'user-contributor-1',
    storage_bucket: 'vault-private',
    storage_path: 'org-1/item-1/photo.jpg',
    mime_type: 'image/jpeg',
  };
  vaultItemFetchError = null;
  pendingItemsData = [
    { id: 'item-1', moderation_status: 'pending' },
    { id: 'item-2', moderation_status: 'flagged_for_review' },
  ];
  pendingItemsError = null;
}

describe('getPendingItems', () => {
  beforeEach(resetState);

  it('returns error when not authenticated', async () => {
    authUser = null;
    const result = await getPendingItems();

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
  });

  it('returns error when no org context', async () => {
    tenantOrgId = null;
    const result = await getPendingItems();

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('No org context');
  });

  it('returns pending and flagged items for the org', async () => {
    const result = await getPendingItems();

    expect('items' in result).toBe(true);
    expect((result as { items: unknown[] }).items).toHaveLength(2);
    expect((result as { items: { id: string }[] }).items[0].id).toBe('item-1');
    expect((result as { items: { id: string }[] }).items[1].id).toBe('item-2');
  });

  it('returns error when DB query fails', async () => {
    pendingItemsError = new Error('DB connection failed');
    const result = await getPendingItems();

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('DB connection failed');
  });
});

describe('approveItem', () => {
  beforeEach(resetState);

  it('returns error when not authenticated', async () => {
    authUser = null;
    const result = await approveItem('item-1');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
  });

  it('returns error when item not found', async () => {
    vaultItemFetchError = new Error('not found');
    const result = await approveItem('item-1');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Item not found');
  });

  it('moves file from vault-private to vault-public and updates status', async () => {
    const result = await approveItem('item-1');

    expect('success' in result && (result as { success: true }).success).toBe(true);
    // File downloaded from private and uploaded to public
    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0].bucket).toBe('vault-public');
    expect(uploadedFiles[0].path).toBe('org-1/item-1/photo.jpg');
    // File removed from private
    expect(removedFiles).toHaveLength(1);
    expect(removedFiles[0].bucket).toBe('vault-private');
    // DB updated
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].table).toBe('vault_items');
    expect(updatedRows[0].payload).toMatchObject({
      moderation_status: 'approved',
      storage_bucket: 'vault-public',
    });
  });

  it('skips file move when item is already in vault-public', async () => {
    vaultItemData = { ...vaultItemData!, storage_bucket: 'vault-public' };
    const result = await approveItem('item-1');

    expect('success' in result && (result as { success: true }).success).toBe(true);
    expect(uploadedFiles).toHaveLength(0);
    expect(removedFiles).toHaveLength(0);
    expect(updatedRows).toHaveLength(1);
  });
});

describe('rejectItem', () => {
  beforeEach(resetState);

  it('returns error when not authenticated', async () => {
    authUser = null;
    const result = await rejectItem('item-1', 'violates guidelines');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
  });

  it('returns error when item not found', async () => {
    vaultItemFetchError = new Error('not found');
    const result = await rejectItem('item-1', 'violates guidelines');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Item not found');
  });

  it('deletes storage file, updates status to rejected, and logs moderation action', async () => {
    const result = await rejectItem('item-1', 'inappropriate content');

    expect('success' in result && (result as { success: true }).success).toBe(true);
    // Storage file removed
    expect(removedFiles).toHaveLength(1);
    expect(removedFiles[0].bucket).toBe('vault-private');
    expect(removedFiles[0].paths).toContain('org-1/item-1/photo.jpg');
    // DB status updated
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].table).toBe('vault_items');
    expect(updatedRows[0].payload).toMatchObject({
      moderation_status: 'rejected',
      rejection_reason: 'inappropriate content',
    });
    // Moderation action logged
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('moderation_actions');
    expect(insertedRows[0].payload).toMatchObject({
      org_id: 'org-1',
      user_id: 'user-contributor-1',
      action: 'takedown',
      reason: 'inappropriate content',
      vault_item_id: 'item-1',
      acted_by: 'admin-user-1',
    });
  });
});

describe('banContributor', () => {
  beforeEach(resetState);

  it('returns error when not authenticated', async () => {
    authUser = null;
    const result = await banContributor('user-bad-actor', 'repeat violations');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Not authenticated.');
  });

  it('returns error when no org context', async () => {
    tenantOrgId = null;
    const result = await banContributor('user-bad-actor', 'repeat violations');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('No org context');
  });

  it('sets membership status to banned and logs moderation action', async () => {
    const result = await banContributor('user-bad-actor', 'repeat violations');

    expect('success' in result && (result as { success: true }).success).toBe(true);
    // org_memberships updated
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].table).toBe('org_memberships');
    expect(updatedRows[0].payload).toMatchObject({ status: 'banned' });
    // Moderation action logged
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('moderation_actions');
    expect(insertedRows[0].payload).toMatchObject({
      org_id: 'org-1',
      user_id: 'user-bad-actor',
      action: 'ban',
      reason: 'repeat violations',
      acted_by: 'admin-user-1',
    });
  });
});
