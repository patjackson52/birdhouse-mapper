import { headers } from 'next/headers';

export async function getTenantContext() {
  const h = await headers();
  const source = h.get('x-tenant-source');

  if (source === 'platform') {
    return {
      orgId: null as null,
      orgSlug: null as null,
      propertyId: null,
      propertySlug: null,
      source: 'platform' as const,
    };
  }

  return {
    orgId: h.get('x-org-id')!,
    orgSlug: h.get('x-org-slug')!,
    propertyId: h.get('x-property-id'),
    propertySlug: h.get('x-property-slug'),
    source: (h.get('x-tenant-source') || 'default') as 'custom_domain' | 'platform_subdomain' | 'default',
  };
}
