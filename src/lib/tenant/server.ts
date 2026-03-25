import { headers } from 'next/headers';

export async function getTenantContext() {
  const h = await headers();  // async in Next.js 15+
  return {
    orgId: h.get('x-org-id')!,
    orgSlug: h.get('x-org-slug')!,
    propertyId: h.get('x-property-id'),
    propertySlug: h.get('x-property-slug'),
  };
}
