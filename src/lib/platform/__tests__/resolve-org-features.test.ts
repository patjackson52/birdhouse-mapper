import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockOrg: any = { subscription_tier: 'free' };
let mockOverrides: any[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'orgs') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockOrg, error: null }),
            }),
          }),
        };
      }
      if (table === 'org_feature_overrides') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: mockOverrides, error: null }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  }),
}));

import { resolveOrgFeatures } from '../resolve-org-features';

describe('resolveOrgFeatures', () => {
  beforeEach(() => {
    mockOrg = { subscription_tier: 'free' };
    mockOverrides = [];
  });

  it('returns free tier defaults with no overrides', async () => {
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(false);
    expect(result.max_properties).toBe(1);
  });

  it('applies overrides from DB', async () => {
    mockOverrides = [
      { feature: 'tasks', value: true },
      { feature: 'max_properties', value: 10 },
    ];
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(true);
    expect(result.max_properties).toBe(10);
  });

  it('uses the correct tier for the org', async () => {
    mockOrg = { subscription_tier: 'pro' };
    const result = await resolveOrgFeatures('org-1');
    expect(result.tasks).toBe(true);
    expect(result.reports).toBe(true);
    expect(result.max_properties).toBeNull();
  });

  it('returns free defaults if org not found', async () => {
    mockOrg = null;
    const result = await resolveOrgFeatures('nonexistent');
    expect(result.tasks).toBe(false);
    expect(result.max_properties).toBe(1);
  });
});
