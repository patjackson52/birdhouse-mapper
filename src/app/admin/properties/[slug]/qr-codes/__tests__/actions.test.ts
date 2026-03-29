import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable state for controlling mock behavior per test
let mockUser: any = { id: 'user-1' };
let mockIsAdmin = true;

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
});
