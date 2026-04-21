import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mutable state for controlling mock behavior ----

let orgData: Record<string, unknown> | null = {
  id: 'org-1',
  allow_public_contributions: true,
  moderation_mode: 'auto_approve',
};
let orgError: Error | null = null;

let authUser: { id: string } | null = { id: 'user-123' };
let signInAnonymouslyResult: { data: { user: { id: string } | null }; error: Error | null } = {
  data: { user: { id: 'anon-456' } },
  error: null,
};

let existingMembership: Record<string, unknown> | null = null;
let roleData: { id: string } | null = { id: 'role-1' };
let newMembershipData: { id: string } | null = { id: 'mem-1' };
let newMembershipError: Error | null = null;
let updateError: Error | null = null;

let moderateTextResult = { flagged: false, categories: {}, scores: {} };
let moderateTextError: Error | null = null;

let uploadToVaultResult:
  | { success: true; item: { moderation_status: string } }
  | { error: string } = {
  success: true,
  item: { moderation_status: 'approved' },
};

// ---- Mocks ----

vi.mock('@/lib/moderation/moderate', () => ({
  moderateText: vi.fn(() => {
    if (moderateTextError) return Promise.reject(moderateTextError);
    return Promise.resolve(moderateTextResult);
  }),
}));

vi.mock('@/lib/vault/actions', () => ({
  uploadToVault: vi.fn(() => Promise.resolve(uploadToVaultResult)),
}));

// Track calls for assertions
let insertCalls: { table: string; payload: Record<string, unknown> }[] = [];
let updateCalls: { table: string; payload: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: authUser },
          error: authUser ? null : new Error('no user'),
        })
      ),
      signInAnonymously: vi.fn(() => Promise.resolve(signInAnonymouslyResult)),
    },
    from: (table: string) => ({
      select: vi.fn((_cols: string) => ({
        eq: vi.fn((_col: string, _val: string) => ({
          single: vi.fn(() => {
            if (table === 'orgs') {
              return Promise.resolve({ data: orgData, error: orgError });
            }
            if (table === 'roles') {
              return Promise.resolve({ data: roleData, error: roleData ? null : new Error('no role') });
            }
            return Promise.resolve({ data: null, error: null });
          }),
          maybeSingle: vi.fn(() => {
            if (table === 'org_memberships') {
              return Promise.resolve({ data: existingMembership, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
          eq: vi.fn((_col2: string, _val2: string) => ({
            single: vi.fn(() => {
              if (table === 'roles') {
                return Promise.resolve({ data: roleData, error: roleData ? null : new Error('no role') });
              }
              return Promise.resolve({ data: null, error: null });
            }),
            maybeSingle: vi.fn(() => {
              if (table === 'org_memberships') {
                return Promise.resolve({ data: existingMembership, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        })),
      })),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return {
          select: vi.fn((_cols: string) => ({
            single: vi.fn(() => {
              if (table === 'org_memberships') {
                return Promise.resolve({ data: newMembershipData, error: newMembershipError });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updateCalls.push({ table, payload });
        return {
          eq: vi.fn((_col: string, _val: string) =>
            Promise.resolve({ error: updateError })
          ),
        };
      }),
    }),
  }),
}));

// ---- Import under test (after mocks) ----
import { submitPublicContribution } from '../actions';

const baseFile = {
  name: 'photo.jpg',
  type: 'image/jpeg',
  size: 1024,
  base64: 'abc123',
};

const baseInput = {
  orgId: 'org-1',
  file: baseFile,
};

// ---- Tests ----

describe('submitPublicContribution', () => {
  beforeEach(() => {
    // Reset all mutable state to defaults
    orgData = {
      id: 'org-1',
      allow_public_contributions: true,
      moderation_mode: 'auto_approve',
    };
    orgError = null;
    authUser = { id: 'user-123' };
    signInAnonymouslyResult = { data: { user: { id: 'anon-456' } }, error: null };
    existingMembership = null;
    roleData = { id: 'role-1' };
    newMembershipData = { id: 'mem-1' };
    newMembershipError = null;
    updateError = null;
    moderateTextResult = { flagged: false, categories: {}, scores: {} };
    moderateTextError = null;
    uploadToVaultResult = { success: true, item: { moderation_status: 'approved' } };
    insertCalls = [];
    updateCalls = [];
    vi.clearAllMocks();
  });

  it('returns error when public contributions are disabled', async () => {
    orgData = { id: 'org-1', allow_public_contributions: false, moderation_mode: 'auto_approve' };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'This organization is not accepting public contributions.' });
  });

  it('returns error when org is not found', async () => {
    orgData = null;
    orgError = new Error('not found');

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'Organization not found.' });
  });

  it('returns error when contributor is banned', async () => {
    existingMembership = {
      id: 'mem-1',
      status: 'banned',
      role_id: 'role-1',
      upload_count_this_hour: 0,
      last_upload_window_start: null,
    };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({
      error: 'Your account has been restricted from contributing to this organization.',
    });
  });

  it('creates anonymous user and membership on first contribution', async () => {
    authUser = null; // no current user — triggers anonymous sign-in
    existingMembership = null; // no existing membership

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ success: true, status: 'approved' });
    // Should have created a membership insert
    const membershipInsert = insertCalls.find((c) => c.table === 'org_memberships');
    expect(membershipInsert).toBeDefined();
    expect(membershipInsert?.payload).toMatchObject({
      org_id: 'org-1',
      role_id: 'role-1',
      status: 'active',
    });
  });

  it('returns error when anonymous sign-in fails', async () => {
    authUser = null;
    signInAnonymouslyResult = { data: { user: null }, error: new Error('sign-in failed') };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'Failed to create session.' });
  });

  it('returns error when public_contributor role is not configured', async () => {
    authUser = null;
    roleData = null;

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'Public contributor role not configured.' });
  });

  it('rate limiting returns error when hourly limit is reached', async () => {
    const recentWindowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 10, // at the limit
      last_upload_window_start: recentWindowStart,
    };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'Upload limit reached. Please try again later.' });
  });

  it('allows upload when rate limit window has expired', async () => {
    const oldWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 10, // old window — should reset
      last_upload_window_start: oldWindowStart,
    };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ success: true, status: 'approved' });
  });

  it('text moderation rejects flagged description', async () => {
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 2,
      last_upload_window_start: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    moderateTextResult = { flagged: true, categories: { hate: true }, scores: { hate: 0.98 } };

    const result = await submitPublicContribution({
      ...baseInput,
      description: 'some offensive text',
    });

    expect(result).toEqual({
      error: "Your submission couldn't be posted because it doesn't meet our content guidelines.",
    });
  });

  it('proceeds when text moderation throws (non-blocking)', async () => {
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 2,
      last_upload_window_start: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    moderateTextError = new Error('moderation service unavailable');

    const result = await submitPublicContribution({
      ...baseInput,
      description: 'some description',
    });

    // Should still proceed to uploadToVault
    expect(result).toEqual({ success: true, status: 'approved' });
  });

  it('returns error from uploadToVault if upload fails', async () => {
    uploadToVaultResult = { error: 'Storage limit reached.' };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ error: 'Storage limit reached.' });
  });

  it('returns success with pending status when org uses manual_review', async () => {
    orgData = {
      id: 'org-1',
      allow_public_contributions: true,
      moderation_mode: 'manual_review',
    };
    uploadToVaultResult = { success: true, item: { moderation_status: 'pending' } };

    const result = await submitPublicContribution(baseInput);

    expect(result).toEqual({ success: true, status: 'pending' });
  });

  it('persists trimmed anon_name when provided', async () => {
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 2,
      last_upload_window_start: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    uploadToVaultResult = { success: true, item: { id: 'vault-1', moderation_status: 'approved' } } as never;

    const result = await submitPublicContribution({
      ...baseInput,
      itemId: 'item-1',
      anonName: '  BirdFan  ',
    } as never);

    expect(result).toEqual({ success: true, status: 'approved' });

    // The item_updates insert should have been called with trimmed anon_name.
    const updateInsert = insertCalls.find((c) => c.table === 'item_updates');
    expect(updateInsert).toBeDefined();
    expect(updateInsert?.payload).toMatchObject({
      org_id: 'org-1',
      item_id: 'item-1',
      vault_item_id: 'vault-1',
      anon_name: 'BirdFan',
    });
  });

  it('stores null anon_name when empty or missing', async () => {
    existingMembership = {
      id: 'mem-1',
      status: 'active',
      role_id: 'role-1',
      upload_count_this_hour: 2,
      last_upload_window_start: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    uploadToVaultResult = { success: true, item: { id: 'vault-1', moderation_status: 'approved' } } as never;

    // Case 1: anonName provided as empty string.
    await submitPublicContribution({
      ...baseInput,
      itemId: 'item-1',
      anonName: '',
    } as never);

    let updateInsert = insertCalls.find((c) => c.table === 'item_updates');
    expect(updateInsert).toBeDefined();
    expect(updateInsert?.payload.anon_name).toBeNull();

    // Reset captured inserts and run again without anonName at all.
    insertCalls.length = 0;

    await submitPublicContribution({
      ...baseInput,
      itemId: 'item-1',
    } as never);

    updateInsert = insertCalls.find((c) => c.table === 'item_updates');
    expect(updateInsert).toBeDefined();
    expect(updateInsert?.payload.anon_name).toBeNull();
  });
});
