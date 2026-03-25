import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTenant, type TenantContext } from '../resolve';

// Mock Supabase client
function createMockClient(responses: Record<string, any>) {
  const mockChain: any = {};
  const methods = ['from', 'select', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle'];

  methods.forEach(method => {
    mockChain[method] = vi.fn().mockReturnValue(mockChain);
  });

  // Override 'from' to track table name
  let currentTable = '';
  mockChain.from = vi.fn((table: string) => {
    currentTable = table;
    return mockChain;
  });

  // Override terminal methods to return data
  mockChain.single = vi.fn().mockImplementation(() => {
    const data = responses[currentTable];
    return Promise.resolve({ data, error: data ? null : { message: 'not found' } });
  });
  mockChain.maybeSingle = vi.fn().mockImplementation(() => {
    const data = responses[`${currentTable}_maybe`] ?? null;
    return Promise.resolve({ data, error: null });
  });

  return mockChain;
}

describe('resolveTenant', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

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

  it('returns null for unknown custom domain', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      custom_domains: null,
    });

    const result = await resolveTenant('unknown.example.com', '/', client);
    expect(result).toBeNull();
  });

  it('resolves custom domain to org', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      custom_domains: {
        org_id: 'org-1', property_id: null,
        orgs: { slug: 'willow-creek' },
        properties: null,
      },
    });

    const result = await resolveTenant('app.willowcreek.org', '/', client);

    expect(result?.source).toBe('custom_domain');
    expect(result?.orgId).toBe('org-1');
    expect(result?.propertyId).toBeNull();
  });

  it('resolves platform subdomain', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      orgs: { id: 'org-1', slug: 'willow-creek', default_property_id: 'prop-1' },
      properties_maybe: null,
    });

    const result = await resolveTenant('willow-creek.myplatform.com', '/map', client);

    expect(result?.source).toBe('platform_subdomain');
    expect(result?.orgSlug).toBe('willow-creek');
  });

  it('returns default org for localhost', async () => {
    process.env.PLATFORM_DOMAIN = 'myplatform.com';
    const client = createMockClient({
      orgs: { id: 'org-1', slug: 'default', default_property_id: 'prop-1' },
    });

    const result = await resolveTenant('localhost', '/', client);
    expect(result?.source).toBe('default');
  });
});
