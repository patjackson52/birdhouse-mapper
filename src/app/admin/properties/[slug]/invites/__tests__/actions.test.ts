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

// Controls for the cross-org admin-scoping tests (see the last describe block).
let mockIsPlatformAdmin = true;
let mockAdminOrgIds: string[] = [];
// org_id filter captured from the getInvites list query.
let capturedInvitesOrgId: unknown;

// getInvites queries the service invites table as select().eq('org_id').order().
// Capture the org filter and make order() terminal so getInvites resolves.
// createInvite doesn't hit these (it uses the count sub-object + insert).
mockServiceChain.eq = vi.fn((col: string, val: unknown) => {
  if (col === 'org_id') capturedInvitesOrgId = val;
  return mockServiceChain;
});
mockServiceChain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));

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
                  data: { is_platform_admin: mockIsPlatformAdmin },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'org_memberships') {
        // Honour the .eq('org_id', ...) scoping so the mock reflects the real
        // cross-org check: a row is returned only when the filtered org_id is
        // one the user actually admins.
        const filters: Record<string, unknown> = {};
        const b: any = {
          select: () => b,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return b;
          },
          limit: () => {
            const baseMatch =
              filters['user_id'] === 'admin-user-id' &&
              filters['status'] === 'active' &&
              filters['roles.base_role'] === 'org_admin' &&
              mockAdminOrgIds.length > 0;
            // If the query DID scope by org_id, only match when it's an org the
            // user admins. If it did NOT (the bug), the unscoped query would
            // return the user's membership in *any* org — so this test fails
            // loudly if the `.eq('org_id', ...)` fix is ever removed.
            const orgMatch =
              filters['org_id'] === undefined
                ? true
                : mockAdminOrgIds.includes(filters['org_id'] as string);
            return Promise.resolve({
              data: baseMatch && orgMatch ? [{ id: 'm-1' }] : [],
              error: null,
            });
          },
        };
        return b;
      }
      return mockUserChain;
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      insertedTable = table;
      if (table === 'roles') {
        // Role validation query: .select().eq().eq().single()
        const roleChain: any = {};
        roleChain.select = () => roleChain;
        roleChain.eq = () => roleChain;
        roleChain.single = () => Promise.resolve({ data: { id: 'role-contributor-id' }, error: null });
        return roleChain;
      }
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
import { createInvite, getInvites } from '../actions';

const validOpts = {
  displayName: 'Test User',
  sessionExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  convertible: false,
  roleId: 'role-contributor-id',
};

describe('createInvite', () => {
  beforeEach(() => {
    insertedPayload = {};
    insertedTable = '';
    countResponse = 0;
    mockOrgId = 'org-123';
    mockIsPlatformAdmin = true;
    mockAdminOrgIds = [];
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
      role_id: 'role-contributor-id',
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

describe('createInvite — org-admin scoping (cross-org)', () => {
  beforeEach(() => {
    insertedPayload = {};
    insertedTable = '';
    countResponse = 0;
    mockOrgId = 'org-123';
    mockIsPlatformAdmin = false;
    mockAdminOrgIds = [];
    vi.clearAllMocks();
  });

  it('allows an org_admin of the current org', async () => {
    mockAdminOrgIds = ['org-123'];

    const result = await createInvite(validOpts);

    expect(result.error).toBeUndefined();
    expect(result.token).toBe('raw-token-abc');
    expect(insertedPayload.org_id).toBe('org-123');
  });

  it('REJECTS an org_admin of a different org', async () => {
    // Admin of org-999, but the tenant is org-123 → must be denied.
    mockAdminOrgIds = ['org-999'];

    const result = await createInvite(validOpts);

    expect(result.error).toBe('Admin access required');
    expect(insertedPayload.org_id).toBeUndefined();
  });

  it('allows a platform admin regardless of org membership', async () => {
    mockIsPlatformAdmin = true;
    mockAdminOrgIds = [];

    const result = await createInvite(validOpts);

    expect(result.error).toBeUndefined();
    expect(result.token).toBe('raw-token-abc');
  });
});

describe('getInvites — org scoping', () => {
  beforeEach(() => {
    mockOrgId = 'org-123';
    mockIsPlatformAdmin = true; // bypass membership; focus on the list query
    mockAdminOrgIds = [];
    capturedInvitesOrgId = undefined;
    vi.clearAllMocks();
  });

  it('scopes the invites list query to the current org', async () => {
    await getInvites();
    // Fails if the `.eq('org_id', tenant.orgId)` on the service-client query
    // is removed — the list would otherwise leak every org's invites.
    expect(capturedInvitesOrgId).toBe('org-123');
  });
});
