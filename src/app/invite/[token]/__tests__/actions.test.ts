import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Capture insert/update payloads per table ----
const inserts: Record<string, Record<string, any>> = {};
const updates: Record<string, Record<string, any>> = {};
let deletedUsers: string[] = [];
let deletedAuthUsers: string[] = [];

const validInvite = {
  id: 'invite-1',
  display_name: 'Volunteer',
  role: 'editor',
  session_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  claimed_by: null,
  convertible: true,
};

const expiredInvite = {
  ...validInvite,
  expires_at: new Date(Date.now() - 1000).toISOString(),
};

const claimedInvite = {
  ...validInvite,
  claimed_by: 'someone-else',
};

let mockInvite: any = validInvite;
let mockInsertError: any = null;
let mockUpdateError: any = null;
let mockAuthUser: any = { user: { id: 'anon-user-1', is_anonymous: true } };

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        getUserById: () => Promise.resolve({ data: mockAuthUser, error: null }),
        deleteUser: (id: string) => {
          deletedAuthUsers.push(id);
          return Promise.resolve({ error: null });
        },
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: table === 'invites' ? mockInvite : null,
              error: mockInvite ? null : { message: 'not found' },
            }),
        }),
      }),
      insert: (payload: any) => {
        inserts[table] = payload;
        return Promise.resolve({ error: mockInsertError });
      },
      update: (payload: any) => {
        updates[table] = payload;
        return {
          eq: () => Promise.resolve({ error: mockUpdateError }),
        };
      },
      delete: () => ({
        eq: (col: string, val: string) => {
          if (table === 'users') deletedUsers.push(val);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/invites/tokens', () => ({
  hashToken: (token: string) => `hashed-${token}`,
}));

const { completeInviteClaim, validateInviteToken } = await import('../actions');

describe('completeInviteClaim', () => {
  beforeEach(() => {
    Object.keys(inserts).forEach((k) => delete inserts[k]);
    Object.keys(updates).forEach((k) => delete updates[k]);
    deletedUsers = [];
    deletedAuthUsers = [];
    mockInvite = { ...validInvite };
    mockInsertError = null;
    mockUpdateError = null;
    mockAuthUser = { user: { id: 'anon-user-1', is_anonymous: true } };
  });

  it('does not include role in the users insert', async () => {
    await completeInviteClaim('raw-token', 'anon-user-1', 'Test Name');

    expect(inserts.users).toBeDefined();
    expect(inserts.users.role).toBeUndefined();
    expect(Object.keys(inserts.users)).not.toContain('role');
  });

  it('inserts correct fields into users table', async () => {
    await completeInviteClaim('raw-token', 'anon-user-1', 'Test Name');

    expect(inserts.users).toEqual({
      id: 'anon-user-1',
      display_name: 'Test Name',
      is_temporary: true,
      session_expires_at: validInvite.session_expires_at,
      invite_id: validInvite.id,
    });
  });

  it('uses invite display_name as fallback when user name is empty', async () => {
    await completeInviteClaim('raw-token', 'anon-user-1', '  ');

    expect(inserts.users.display_name).toBe('Volunteer');
  });

  it('falls back to Guest when both names are empty', async () => {
    mockInvite = { ...validInvite, display_name: null };

    await completeInviteClaim('raw-token', 'anon-user-1', '');

    expect(inserts.users.display_name).toBe('Guest');
  });

  it('marks invite as claimed on success', async () => {
    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result).toEqual({ success: true, convertible: true });
    expect(updates.invites.claimed_by).toBe('anon-user-1');
    expect(updates.invites.claimed_at).toBeDefined();
  });

  it('rejects non-anonymous auth users', async () => {
    mockAuthUser = { user: { id: 'anon-user-1', is_anonymous: false } };

    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result.error).toBe('Invalid session. Please try again.');
    expect(inserts.users).toBeUndefined();
  });

  it('rejects already-claimed invite', async () => {
    mockInvite = claimedInvite;

    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result.error).toBe('This invite has already been claimed');
  });

  it('rejects expired invite', async () => {
    mockInvite = expiredInvite;

    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result.error).toBe('This invite has expired');
  });

  it('cleans up auth user on profile insert failure', async () => {
    mockInsertError = { message: 'insert failed' };

    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result.error).toBe('Failed to create profile. Please try again.');
    expect(deletedAuthUsers).toContain('anon-user-1');
  });

  it('cleans up profile and auth user on claim update failure', async () => {
    mockUpdateError = { message: 'update failed' };

    const result = await completeInviteClaim('raw-token', 'anon-user-1', 'Test');

    expect(result.error).toBe('Failed to complete invite claim.');
    expect(deletedUsers).toContain('anon-user-1');
    expect(deletedAuthUsers).toContain('anon-user-1');
  });
});

describe('validateInviteToken', () => {
  beforeEach(() => {
    mockInvite = { ...validInvite };
  });

  it('returns valid for unclaimed, unexpired invite', async () => {
    const result = await validateInviteToken('raw-token');

    expect(result.valid).toBe(true);
    expect(result.invite).toEqual({
      id: validInvite.id,
      display_name: validInvite.display_name,
      session_expires_at: validInvite.session_expires_at,
    });
  });

  it('returns not_found for missing invite', async () => {
    mockInvite = null;

    const result = await validateInviteToken('bad-token');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('returns already_claimed for claimed invite', async () => {
    mockInvite = claimedInvite;

    const result = await validateInviteToken('raw-token');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('already_claimed');
  });

  it('returns expired for expired invite', async () => {
    mockInvite = expiredInvite;

    const result = await validateInviteToken('raw-token');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });
});
