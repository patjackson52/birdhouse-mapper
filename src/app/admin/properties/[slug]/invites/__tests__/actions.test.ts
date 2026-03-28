import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Capture insert payloads ----
let insertedTable = '';
let insertedPayload: Record<string, any> = {};
let countResponse = 0;

// Chainable mock helper
function chain(terminal?: any) {
  const c: any = {};
  const methods = ['select', 'eq', 'is', 'gt', 'limit', 'order', 'in', 'single'];
  for (const m of methods) c[m] = vi.fn(() => c);
  c.insert = vi.fn((payload: any) => {
    insertedPayload = payload;
    return Promise.resolve({ error: null });
  });
  // count query support
  c.select = vi.fn((_cols?: string, opts?: any) => {
    if (opts?.count === 'exact') {
      const r: any = { data: null, count: countResponse, error: null };
      r.eq = () => r;
      r.is = () => r;
      r.gt = () => r;
      return r;
    }
    return c;
  });
  return c;
}

const mockServiceChain = chain();
const mockUserChain = chain();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: 'admin-user-id' } },
        }),
    },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { is_platform_admin: true },
                  error: null,
                }),
            }),
          }),
        };
      }
      return mockUserChain;
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      insertedTable = table;
      return mockServiceChain;
    },
  }),
}));

let mockOrgId: string | null = 'org-123';

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: () =>
    Promise.resolve({
      orgId: mockOrgId,
      orgSlug: 'test-org',
      propertyId: null,
      propertySlug: null,
      source: 'default',
    }),
}));

vi.mock('@/lib/invites/tokens', () => ({
  generateToken: () => 'raw-token-abc',
  hashToken: () => 'hashed-token-abc',
}));

// vi.mock is hoisted by vitest, so regular imports work
import { createInvite } from '../actions';

const validOpts = {
  displayName: 'Test User',
  sessionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  convertible: false,
};

describe('createInvite', () => {
  beforeEach(() => {
    insertedPayload = {};
    insertedTable = '';
    countResponse = 0;
    mockOrgId = 'org-123';
    vi.clearAllMocks();
  });

  it('includes org_id from tenant context in the invite insert', async () => {
    const result = await createInvite(validOpts);

    expect(result.token).toBe('raw-token-abc');
    expect(insertedTable).toBe('invites');
    expect(insertedPayload.org_id).toBe('org-123');
  });

  it('returns error when tenant has no orgId', async () => {
    mockOrgId = null;

    const result = await createInvite(validOpts);

    expect(result.error).toBe('No org context');
    expect(insertedPayload.org_id).toBeUndefined();
  });

  it('does not include property_id in the invite insert', async () => {
    await createInvite(validOpts);

    expect(insertedPayload.property_id).toBeUndefined();
  });

  it('includes all required invite fields', async () => {
    await createInvite(validOpts);

    expect(insertedPayload).toMatchObject({
      org_id: 'org-123',
      token: 'hashed-token-abc',
      created_by: 'admin-user-id',
      display_name: 'Test User',
      role: 'editor',
      convertible: false,
    });
    expect(insertedPayload.session_expires_at).toBe(validOpts.sessionExpiresAt);
    expect(insertedPayload.expires_at).toBeDefined();
  });

  it('sets display_name to null when empty string provided', async () => {
    await createInvite({ ...validOpts, displayName: '' });

    expect(insertedPayload.display_name).toBeNull();
  });
});
