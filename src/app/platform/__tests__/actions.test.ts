import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: any = { id: 'admin-1' };
let mockProfile: any = { is_platform_admin: true };
let mockOrg: any = { id: 'org-1', name: 'Test Org', slug: 'test-org', subscription_tier: 'free', subscription_status: 'active' };
let mockUpdateError: any = null;
let mockUpsertError: any = null;
let mockDeleteError: any = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser } }),
    },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockProfile, error: null }) }) }),
        };
      }
      if (table === 'orgs') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockOrg, error: null }) }) }),
          update: (payload: any) => ({
            eq: () => Promise.resolve({ error: mockUpdateError }),
          }),
        };
      }
      if (table === 'org_feature_overrides') {
        return {
          upsert: () => Promise.resolve({ error: mockUpsertError }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: mockDeleteError }) }) }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  }),
}));

import { updateOrg, setFeatureOverride, removeFeatureOverride } from '../actions';

describe('platform actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'admin-1' };
    mockProfile = { is_platform_admin: true };
    mockOrg = { id: 'org-1', name: 'Test Org', slug: 'test-org', subscription_tier: 'free', subscription_status: 'active' };
    mockUpdateError = null;
    mockUpsertError = null;
    mockDeleteError = null;
  });

  describe('updateOrg', () => {
    it('rejects unauthenticated users', async () => {
      mockUser = null;
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'Not authenticated' });
    });

    it('rejects non-platform-admin users', async () => {
      mockProfile = { is_platform_admin: false };
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('updates org successfully', async () => {
      const result = await updateOrg('org-1', { subscription_tier: 'pro' });
      expect(result).toEqual({ success: true });
    });

    it('returns error on DB failure', async () => {
      mockUpdateError = { message: 'DB error' };
      const result = await updateOrg('org-1', { name: 'New Name' });
      expect(result).toEqual({ error: 'DB error' });
    });
  });

  describe('setFeatureOverride', () => {
    it('rejects non-platform-admin users', async () => {
      mockProfile = { is_platform_admin: false };
      const result = await setFeatureOverride('org-1', 'tasks', true);
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('sets override successfully', async () => {
      const result = await setFeatureOverride('org-1', 'tasks', true, 'trial');
      expect(result).toEqual({ success: true });
    });

    it('rejects unknown feature keys', async () => {
      const result = await setFeatureOverride('org-1', 'nonexistent', true);
      expect(result).toEqual({ error: 'Unknown feature: nonexistent' });
    });
  });

  describe('removeFeatureOverride', () => {
    it('removes override successfully', async () => {
      const result = await removeFeatureOverride('org-1', 'tasks');
      expect(result).toEqual({ success: true });
    });
  });
});
