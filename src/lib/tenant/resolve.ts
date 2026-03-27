import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgTenantContext {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  source: 'custom_domain' | 'platform_subdomain' | 'default';
}

export interface PlatformContext {
  orgId: null;
  orgSlug: null;
  propertyId: null;
  propertySlug: null;
  source: 'platform';
}

export type TenantContext = OrgTenantContext | PlatformContext;

/**
 * Resolve tenant context from hostname and pathname.
 * IMPORTANT: The supabase client passed here MUST be a service-role client
 * (not anon key) because custom_domains has no anonymous SELECT policy.
 * The middleware creates the service-role client and passes it in.
 */
export async function resolveTenant(
  hostname: string,
  pathname: string,
  supabase: SupabaseClient
): Promise<TenantContext | null> {
  const platformDomain = process.env.PLATFORM_DOMAIN;

  // Signal 0: Platform root — exact match on PLATFORM_DOMAIN with no subdomain
  if (platformDomain && hostname === platformDomain) {
    return {
      orgId: null,
      orgSlug: null,
      propertyId: null,
      propertySlug: null,
      source: 'platform' as const,
    };
  }

  // Signal A: Custom domain lookup
  // Skip for Vercel preview/dev deployments — they should fall through to Signal D (default org)
  // like localhost does. VERCEL_ENV is automatically set by Vercel on preview/branch deployments.
  const isVercelPreview =
    hostname.endsWith('.vercel.app') ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'development';

  if (platformDomain && !hostname.endsWith(platformDomain) && hostname !== 'localhost' && !isVercelPreview) {
    const { data: domain } = await supabase
      .from('custom_domains')
      .select('org_id, property_id, orgs!custom_domains_org_id_fkey!inner(slug, is_active), properties!custom_domains_property_id_fkey(slug, is_active, deleted_at)')
      .eq('domain', hostname)
      .eq('status', 'active')
      .eq('orgs.is_active', true)
      .single();

    if (domain) {
      // Skip if property is inactive or deleted
      const prop = (domain as any).properties;
      if (prop && (prop.is_active === false || prop.deleted_at !== null)) {
        return null;
      }
      return {
        orgId: domain.org_id,
        orgSlug: (domain as any).orgs?.slug,
        propertyId: domain.property_id,
        propertySlug: prop?.slug ?? null,
        source: 'custom_domain',
      };
    }
    return null; // unknown domain -> 404
  }

  // Signal B/C: Platform subdomain (+ optional property path)
  if (platformDomain && hostname.endsWith(platformDomain)) {
    const subdomain = hostname.replace(`.${platformDomain}`, '');
    if (subdomain && subdomain !== hostname) {
      const { data: org } = await supabase
        .from('orgs')
        .select('id, slug, default_property_id')
        .eq('slug', subdomain)
        .eq('is_active', true)
        .single();

      if (!org) return null; // unknown subdomain -> 404

      // Check if first path segment is a property slug
      const pathSegments = pathname.split('/').filter(Boolean);
      let propertyId = org.default_property_id;
      let propertySlug: string | null = null;

      if (pathSegments.length > 0) {
        const { data: property } = await supabase
          .from('properties')
          .select('id, slug')
          .eq('org_id', org.id)
          .eq('slug', pathSegments[0])
          .eq('is_active', true)
          .is('deleted_at', null)
          .maybeSingle();

        if (property) {
          propertyId = property.id;
          propertySlug = property.slug;
        }
      }

      return {
        orgId: org.id,
        orgSlug: org.slug,
        propertyId,
        propertySlug,
        source: 'platform_subdomain',
      };
    }
  }

  // Signal D: Default org shortcut (single-org, localhost, no PLATFORM_DOMAIN)
  const { data: org } = await supabase
    .from('orgs')
    .select('id, slug, default_property_id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!org) return null;

  return {
    orgId: org.id,
    orgSlug: org.slug,
    propertyId: org.default_property_id,
    propertySlug: null,
    source: 'default',
  };
}
