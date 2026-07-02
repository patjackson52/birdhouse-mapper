import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock state, controlled per test -------------------------------------
let mockUser: { id: string } | null = { id: 'user-1' };
let mockTenant: { orgId: string | null; orgSlug?: string | null } = {
  orgId: 'org-1',
  orgSlug: 'test-org',
};
let mockIsPlatformAdmin = false;
// Active org_admin memberships for the user, by org id. requireOrgAdmin must
// only match the row whose org_id equals the CURRENT tenant org.
let mockAdminOrgIds: string[] = [];

// Captures the eq() filters applied to the org_memberships query so the mock
// can honour the .eq('org_id', ...) scoping the real helper must enforce.
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
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
        const filters: Record<string, unknown> = {};
        const builder: any = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          limit: () => {
            const orgId = filters['org_id'];
            const userMatches = filters['user_id'] === mockUser?.id;
            const roleMatches = filters['roles.base_role'] === 'org_admin';
            const statusActive = filters['status'] === 'active';
            const orgMatches =
              typeof orgId === 'string' && mockAdminOrgIds.includes(orgId);
            const hit =
              userMatches && roleMatches && statusActive && orgMatches;
            return Promise.resolve({ data: hit ? [{ id: 'm-1' }] : [], error: null });
          },
        };
        return builder;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null }),
      };
    },
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: () => Promise.resolve(mockTenant),
}));

import { requireOrgContext, requireOrgAdmin, isAuthFailure } from '../require-org';

beforeEach(() => {
  mockUser = { id: 'user-1' };
  mockTenant = { orgId: 'org-1', orgSlug: 'test-org' };
  mockIsPlatformAdmin = false;
  mockAdminOrgIds = [];
});

describe('requireOrgContext', () => {
  it('returns {error} when there is no org context', async () => {
    mockTenant = { orgId: null };
    const r = await requireOrgContext();
    expect(isAuthFailure(r)).toBe(true);
    expect((r as { error: string }).error).toMatch(/org context/i);
  });

  it('returns {error} when the user is not authenticated', async () => {
    mockUser = null;
    const r = await requireOrgContext();
    expect(isAuthFailure(r)).toBe(true);
    expect((r as { error: string }).error).toMatch(/not authenticated/i);
  });

  it('returns the org-scoped context on success', async () => {
    const r = await requireOrgContext();
    expect(isAuthFailure(r)).toBe(false);
    if (isAuthFailure(r)) throw new Error('unreachable');
    expect(r.orgId).toBe('org-1');
    expect(r.user.id).toBe('user-1');
    expect(r.tenant.orgId).toBe('org-1');
  });
});

describe('requireOrgAdmin', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser = null;
    const r = await requireOrgAdmin();
    expect(isAuthFailure(r)).toBe(true);
  });

  it('allows a platform admin without any org membership', async () => {
    mockIsPlatformAdmin = true;
    mockAdminOrgIds = [];
    const r = await requireOrgAdmin();
    expect(isAuthFailure(r)).toBe(false);
  });

  it('allows an org_admin OF THE CURRENT org', async () => {
    mockAdminOrgIds = ['org-1'];
    const r = await requireOrgAdmin();
    expect(isAuthFailure(r)).toBe(false);
  });

  it('REJECTS an admin of a DIFFERENT org (cross-org scoping)', async () => {
    // User is org_admin of org-2 but the tenant is org-1 → must be denied.
    mockAdminOrgIds = ['org-2'];
    mockTenant = { orgId: 'org-1', orgSlug: 'test-org' };
    const r = await requireOrgAdmin();
    expect(isAuthFailure(r)).toBe(true);
    expect((r as { error: string }).error).toMatch(/admin/i);
  });

  it('rejects a non-admin member', async () => {
    mockAdminOrgIds = [];
    const r = await requireOrgAdmin();
    expect(isAuthFailure(r)).toBe(true);
  });
});
