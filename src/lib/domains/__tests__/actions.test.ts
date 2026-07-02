import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auth context returned by requireOrgAdmin (swapped per test).
let mockAuth: any;
// Domain row returned by the org-scoped custom_domains fetch (null = not owned).
let mockDomainRow: { domain: string } | null = null;
const vercelCalls: string[] = [];

function makeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'properties') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'prop-1' } }) }) }) }) };
      }
      if (table === 'custom_domains') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockDomainRow, error: mockDomainRow ? null : { message: 'not found' } }) }) }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'dom-1' }, error: null }) }) }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      return {};
    },
  };
}

vi.mock('@/lib/auth/require-org', () => ({
  isAuthFailure: (r: any) => 'error' in r,
  requireOrgAdmin: () => Promise.resolve(mockAuth),
}));

vi.mock('../vercel', () => ({
  addDomainToVercel: (d: string) => { vercelCalls.push(`add:${d}`); return Promise.resolve({ verified: false, verification: [] }); },
  removeDomainFromVercel: (d: string) => { vercelCalls.push(`remove:${d}`); return Promise.resolve(); },
  checkDomainOnVercel: (d: string) => { vercelCalls.push(`check:${d}`); return Promise.resolve({ verified: true, verification: [] }); },
}));

import { addCustomDomain, removeCustomDomain, checkDomainStatus } from '../actions';

beforeEach(() => {
  vercelCalls.length = 0;
  mockDomainRow = null;
  mockAuth = { supabase: makeSupabase(), user: { id: 'u-1' }, tenant: { orgId: 'org-1' }, orgId: 'org-1' };
});

describe('domains actions — auth required', () => {
  beforeEach(() => { mockAuth = { error: 'Admin access required' }; });

  it('addCustomDomain refuses non-admins and never calls Vercel', async () => {
    const r = await addCustomDomain('org-1', 'x.com');
    expect(r).toEqual({ success: false, error: 'Admin access required' });
    expect(vercelCalls).toHaveLength(0);
  });

  it('removeCustomDomain refuses non-admins and never calls Vercel', async () => {
    const r = await removeCustomDomain('dom-1');
    expect(r).toEqual({ success: false, error: 'Admin access required' });
    expect(vercelCalls).toHaveLength(0);
  });

  it('checkDomainStatus refuses non-admins', async () => {
    const r = await checkDomainStatus('dom-1');
    expect(r.error).toBe('Admin access required');
    expect(r.verified).toBe(false);
    expect(vercelCalls).toHaveLength(0);
  });
});

describe('domains actions — org scoping', () => {
  it('addCustomDomain rejects registering a domain for another org', async () => {
    // caller is admin of org-1 but passes org-2
    const r = await addCustomDomain('org-2', 'x.com');
    expect(r).toEqual({ success: false, error: 'Cannot add a domain for another org' });
    expect(vercelCalls).toHaveLength(0);
  });

  it('removeCustomDomain treats a domain outside the caller org as not found', async () => {
    mockDomainRow = null; // org-scoped fetch finds nothing
    const r = await removeCustomDomain('dom-other-org');
    expect(r).toEqual({ success: false, error: 'Domain not found' });
    expect(vercelCalls).toHaveLength(0);
  });

  it('addCustomDomain succeeds for the caller own org', async () => {
    const r = await addCustomDomain('org-1', 'mine.com');
    expect(r.success).toBe(true);
    expect(r.domainId).toBe('dom-1');
    expect(vercelCalls).toContain('add:mine.com');
  });

  it('removeCustomDomain succeeds for an owned domain', async () => {
    mockDomainRow = { domain: 'mine.com' };
    const r = await removeCustomDomain('dom-1');
    expect(r).toEqual({ success: true });
    expect(vercelCalls).toContain('remove:mine.com');
  });
});
