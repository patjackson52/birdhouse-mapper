import { createClient } from '@/lib/supabase/server';

export type SpeciesContext = {
  orgId: string | null;
  orgName: string;
  propertyId: string | null;
  propertyName: string;
};

export async function resolveContextFromUrl(fromUrl: string | null): Promise<SpeciesContext> {
  const fallback: SpeciesContext = {
    orgId: null,
    orgName: 'Organization',
    propertyId: null,
    propertyName: 'Property',
  };
  if (!fromUrl) return fallback;
  const m = fromUrl.match(/^\/p\/([^/]+)\/item\/([^/?#]+)/) || fromUrl.match(/^\/p\/([^/]+)/);
  const slug = m?.[1];
  if (!slug) return fallback;

  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('id, name, org_id, orgs(name)')
    .eq('slug', slug)
    .maybeSingle();

  if (!property) return fallback;

  return {
    orgId: (property as any).org_id ?? null,
    orgName: (property as any).orgs?.name ?? 'Organization',
    propertyId: (property as any).id ?? null,
    propertyName: (property as any).name ?? 'Property',
  };
}
