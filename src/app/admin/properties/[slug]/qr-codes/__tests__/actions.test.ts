import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable state for controlling mock behavior per test
let mockUser: any = { id: 'user-1' };
let mockIsAdmin = true;
// org ids the user is an active org_admin of (for cross-org scoping tests)
let mockAdminOrgIds: string[] = [];

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
                  data: { is_platform_admin: mockIsAdmin },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'org_memberships') {
        // Honour the .eq('org_id', ...) scoping. Models the unscoped-query bug:
        // when the query omits org_id, an admin of ANY org would match — so the
        // cross-org reject test fails loudly if the org scoping is removed.
        const filters: Record<string, unknown> = {};
        const b: any = {
          select: () => b,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return b;
          },
          limit: () => {
            const baseMatch =
              filters['user_id'] === mockUser?.id &&
              filters['status'] === 'active' &&
              filters['roles.base_role'] === 'org_admin' &&
              mockAdminOrgIds.length > 0;
            const orgMatch =
              filters['org_id'] === undefined
                ? true
                : mockAdminOrgIds.includes(filters['org_id'] as string);
            return Promise.resolve({ data: baseMatch && orgMatch ? [{ id: 'm-1' }] : [], error: null });
          },
        };
        return b;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }),
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: () => Promise.resolve({ orgId: 'org-1', orgSlug: 'test-org' }),
}));

import { createQrCode } from '../actions';

describe('QR code actions', () => {
  const mockProperty = { id: 'prop-1', slug: 'test-park' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockIsAdmin = true;
    mockAdminOrgIds = [];
  });

  it('rejects unauthenticated users', async () => {
    mockUser = null;
    const result = await createQrCode({
      propertyId: mockProperty.id,
      propertySlug: mockProperty.slug,
      placement: 'entrance',
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('rejects non-admin users', async () => {
    mockIsAdmin = false;
    const result = await createQrCode({
      propertyId: mockProperty.id,
      propertySlug: mockProperty.slug,
      placement: 'entrance',
    });
    expect(result).toEqual({ error: 'Admin access required' });
  });

  it('rejects an org_admin of a different org (cross-org scoping)', async () => {
    // Admin of org-2, but the tenant is org-1 → must be denied.
    mockIsAdmin = false;
    mockAdminOrgIds = ['org-2'];
    const result = await createQrCode({
      propertyId: mockProperty.id,
      propertySlug: mockProperty.slug,
      placement: 'entrance',
    });
    expect(result).toEqual({ error: 'Admin access required' });
  });
});
