import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveTenant, type TenantContext } from '../resolve';

// Mock Supabase client that tracks chained calls and returns configured responses.
// Supports per-table responses and inspecting which tables/filters were used.
function createMockClient(responses: Record<string, any>) {
  const mockChain: any = {};
  const calls: { table: string; method: string; args: any[] }[] = [];
  const methods = ['from', 'select', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle'];

  methods.forEach(method => {
    mockChain[method] = vi.fn().mockReturnValue(mockChain);
  });

  // Track which table is being queried
  let currentTable = '';
  mockChain.from = vi.fn((table: string) => {
    currentTable = table;
    calls.push({ table, method: 'from', args: [table] });
    return mockChain;
  });

  // Track eq calls for assertions
  const originalEq = mockChain.eq;
  mockChain.eq = vi.fn((...args: any[]) => {
    calls.push({ table: currentTable, method: 'eq', args });
    return mockChain;
  });

  // Terminal methods return configured data
  mockChain.single = vi.fn().mockImplementation(() => {
    const data = responses[currentTable];
    return Promise.resolve({ data, error: data ? null : { message: 'not found' } });
  });
  mockChain.maybeSingle = vi.fn().mockImplementation(() => {
    const data = responses[`${currentTable}_maybe`] ?? null;
    return Promise.resolve({ data, error: null });
  });

  mockChain._calls = calls;
  return mockChain;
}

describe('resolveTenant', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  // =========================================================================
  // Signal 0: Platform root
  // =========================================================================

  describe('Signal 0: Platform root', () => {
    it('returns platform context when hostname exactly matches PLATFORM_DOMAIN', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({});

      const result = await resolveTenant('fieldmapper.org', '/', client);

      expect(result).toEqual({
        orgId: null,
        orgSlug: null,
        propertyId: null,
        propertySlug: null,
        source: 'platform',
      });
    });

    it('returns platform context for vercel domain', async () => {
      process.env.PLATFORM_DOMAIN = 'birdhouse-mapper.vercel.app';
      const client = createMockClient({});

      const result = await resolveTenant('birdhouse-mapper.vercel.app', '/', client);

      expect(result).toEqual({
        orgId: null,
        orgSlug: null,
        propertyId: null,
        propertySlug: null,
        source: 'platform',
      });
    });

    it('does NOT return platform context for subdomains of PLATFORM_DOMAIN', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'eagles', default_property_id: 'prop-1' },
      });

      const result = await resolveTenant('eagles.fieldmapper.org', '/', client);

      expect(result?.source).not.toBe('platform');
      expect(result?.source).toBe('platform_subdomain');
    });

    it('does NOT trigger when PLATFORM_DOMAIN is not set', async () => {
      delete process.env.PLATFORM_DOMAIN;
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      const result = await resolveTenant('fieldmapper.org', '/', client);

      // Falls through to Signal D
      expect(result?.source).toBe('default');
    });
  });

  // =========================================================================
  // Signal A: Custom domain lookup
  // =========================================================================

  describe('Signal A: Custom domain lookup', () => {
    it('resolves a known custom domain to org + property', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: 'prop-1',
          orgs: { slug: 'springbrook', is_active: true },
          properties: { slug: 'default', is_active: true, deleted_at: null },
        },
      });

      const result = await resolveTenant('fairbankseagle.org', '/', client);

      expect(result).toEqual({
        orgId: 'org-1',
        orgSlug: 'springbrook',
        propertyId: 'prop-1',
        propertySlug: 'default',
        source: 'custom_domain',
      });
    });

    it('resolves custom domain with www prefix', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: 'prop-1',
          orgs: { slug: 'springbrook', is_active: true },
          properties: { slug: 'default', is_active: true, deleted_at: null },
        },
      });

      const result = await resolveTenant('www.fairbankseagle.org', '/', client);

      expect(result?.source).toBe('custom_domain');
      expect(result?.orgId).toBe('org-1');
    });

    it('resolves org-level custom domain (no property)', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: null,
          orgs: { slug: 'willow-creek', is_active: true },
          properties: null,
        },
      });

      const result = await resolveTenant('willowcreek.org', '/', client);

      expect(result?.source).toBe('custom_domain');
      expect(result?.orgId).toBe('org-1');
      expect(result?.propertyId).toBeNull();
      expect(result?.propertySlug).toBeNull();
    });

    it('returns null for unknown custom domain', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: null,
      });

      const result = await resolveTenant('unknown-domain.com', '/', client);
      expect(result).toBeNull();
    });

    it('returns null when property is inactive', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: 'prop-1',
          orgs: { slug: 'springbrook', is_active: true },
          properties: { slug: 'default', is_active: false, deleted_at: null },
        },
      });

      const result = await resolveTenant('fairbankseagle.org', '/', client);
      expect(result).toBeNull();
    });

    it('returns null when property is soft-deleted', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: 'prop-1',
          orgs: { slug: 'springbrook', is_active: true },
          properties: { slug: 'default', is_active: true, deleted_at: '2026-01-01' },
        },
      });

      const result = await resolveTenant('fairbankseagle.org', '/', client);
      expect(result).toBeNull();
    });

    it('queries custom_domains table with correct filters', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({ custom_domains: null });

      await resolveTenant('fairbankseagle.org', '/', client);

      // Verify the query hit custom_domains
      expect(client.from).toHaveBeenCalledWith('custom_domains');
      // Verify domain filter
      const eqCalls = client._calls.filter(
        (c: any) => c.method === 'eq' && c.table === 'custom_domains'
      );
      expect(eqCalls.some((c: any) => c.args[0] === 'domain' && c.args[1] === 'fairbankseagle.org')).toBe(true);
      expect(eqCalls.some((c: any) => c.args[0] === 'status' && c.args[1] === 'active')).toBe(true);
    });

    it('does not query custom_domains for localhost', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      await resolveTenant('localhost', '/', client);

      // Should skip Signal A and go to Signal D
      const fromCalls = client._calls.filter((c: any) => c.method === 'from');
      expect(fromCalls.some((c: any) => c.args[0] === 'custom_domains')).toBe(false);
    });

    it('does not query custom_domains for *.vercel.app hostnames', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      await resolveTenant('birdhouse-mapper-git-my-branch-user.vercel.app', '/', client);

      // Should skip Signal A (no custom_domains lookup) and fall through to Signal D
      const fromCalls = client._calls.filter((c: any) => c.method === 'from');
      expect(fromCalls.some((c: any) => c.args[0] === 'custom_domains')).toBe(false);
    });

    it('returns default org for *.vercel.app preview URL', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      const result = await resolveTenant('birdhouse-mapper-git-my-branch-user.vercel.app', '/', client);

      expect(result?.source).toBe('default');
      expect(result?.orgId).toBe('org-1');
    });

    it('does not query custom_domains when VERCEL_ENV is preview', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      process.env.VERCEL_ENV = 'preview';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      await resolveTenant('some-random-host.example.com', '/', client);

      const fromCalls = client._calls.filter((c: any) => c.method === 'from');
      expect(fromCalls.some((c: any) => c.args[0] === 'custom_domains')).toBe(false);
      delete process.env.VERCEL_ENV;
    });
  });

  // =========================================================================
  // Signal B/C: Platform subdomain
  // =========================================================================

  describe('Signal B/C: Platform subdomain', () => {
    it('resolves org subdomain to org context', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'eagles', default_property_id: 'prop-1' },
        properties_maybe: null,
      });

      const result = await resolveTenant('eagles.fieldmapper.org', '/map', client);

      expect(result).toEqual({
        orgId: 'org-1',
        orgSlug: 'eagles',
        propertyId: 'prop-1',
        propertySlug: null,
        source: 'platform_subdomain',
      });
    });

    it('resolves property path segment under org subdomain', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'eagles', default_property_id: 'prop-1' },
        properties_maybe: { id: 'prop-2', slug: 'elm-street' },
      });

      const result = await resolveTenant('eagles.fieldmapper.org', '/elm-street/map', client);

      expect(result?.propertyId).toBe('prop-2');
      expect(result?.propertySlug).toBe('elm-street');
      expect(result?.source).toBe('platform_subdomain');
    });

    it('returns null for unknown org subdomain', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: null,
      });

      const result = await resolveTenant('nonexistent.fieldmapper.org', '/', client);
      expect(result).toBeNull();
    });

    it('falls back to default property when path segment is not a property', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'eagles', default_property_id: 'prop-1' },
        properties_maybe: null, // path segment didn't match any property
      });

      const result = await resolveTenant('eagles.fieldmapper.org', '/admin', client);

      expect(result?.propertyId).toBe('prop-1');
      expect(result?.propertySlug).toBeNull();
    });
  });

  // =========================================================================
  // Signal D: Default org fallback
  // =========================================================================

  describe('Signal D: Default org fallback', () => {
    it('returns default org when PLATFORM_DOMAIN is not set', async () => {
      delete process.env.PLATFORM_DOMAIN;
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      const result = await resolveTenant('localhost', '/', client);

      expect(result).toEqual({
        orgId: 'org-1',
        orgSlug: 'default',
        propertyId: 'prop-1',
        propertySlug: null,
        source: 'default',
      });
    });

    it('returns default org for localhost even when PLATFORM_DOMAIN is set', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      const result = await resolveTenant('localhost', '/', client);

      expect(result?.source).toBe('default');
    });

    it('returns null when no orgs exist', async () => {
      delete process.env.PLATFORM_DOMAIN;
      const client = createMockClient({
        orgs: null,
      });

      const result = await resolveTenant('localhost', '/', client);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Signal priority / edge cases
  // =========================================================================

  describe('Signal priority and edge cases', () => {
    it('Signal 0 takes priority over Signal A for exact platform domain', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      // Even if fieldmapper.org were in custom_domains, Signal 0 should fire first
      const client = createMockClient({
        custom_domains: {
          org_id: 'org-1',
          property_id: 'prop-1',
          orgs: { slug: 'some-org' },
          properties: { slug: 'default', is_active: true, deleted_at: null },
        },
      });

      const result = await resolveTenant('fieldmapper.org', '/', client);

      expect(result?.source).toBe('platform');
      // custom_domains should NOT have been queried
      const fromCalls = client._calls.filter((c: any) => c.method === 'from');
      expect(fromCalls.some((c: any) => c.args[0] === 'custom_domains')).toBe(false);
    });

    it('Signal A fires for non-platform, non-localhost domains', async () => {
      process.env.PLATFORM_DOMAIN = 'fieldmapper.org';
      const client = createMockClient({ custom_domains: null });

      await resolveTenant('example.com', '/', client);

      const fromCalls = client._calls.filter((c: any) => c.method === 'from');
      expect(fromCalls[0].args[0]).toBe('custom_domains');
    });

    it('handles port in hostname for localhost', async () => {
      delete process.env.PLATFORM_DOMAIN;
      const client = createMockClient({
        orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
      });

      // localhost:3000 should still go to Signal D
      const result = await resolveTenant('localhost:3000', '/', client);

      // localhost:3000 !== 'localhost' exactly, but doesn't end with PLATFORM_DOMAIN either
      // This falls through to Signal D since PLATFORM_DOMAIN is not set
      expect(result?.source).toBe('default');
    });

    it('platform domain with port in hostname matches Signal 0', async () => {
      process.env.PLATFORM_DOMAIN = 'localhost';
      const client = createMockClient({});

      const result = await resolveTenant('localhost:3000', '/', client);

      expect(result?.source).toBe('platform');
    });
  });
});
