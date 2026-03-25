'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export type OrgDomain = {
  id: string;
  domain: string;
  domain_type: string;
  status: string;
  ssl_status: string | null;
  is_primary: boolean;
  property_id: string | null;
  property_name: string | null;
  verified_at: string | null;
  created_at: string;
  verification_token: string | null;
};

export type PropertyForDomains = {
  id: string;
  name: string;
  slug: string;
  primary_custom_domain_id: string | null;
};

export async function getOrgDomains(): Promise<{
  orgDomains: OrgDomain[];
  propertyDomains: OrgDomain[];
  error?: string;
}> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { orgDomains: [], propertyDomains: [], error: 'No org context' };

  const { data, error } = await supabase
    .from('custom_domains')
    .select(`
      id,
      domain,
      domain_type,
      status,
      ssl_status,
      is_primary,
      property_id,
      verified_at,
      created_at,
      verification_token,
      properties ( name )
    `)
    .eq('org_id', tenant.orgId)
    .order('created_at', { ascending: true });

  if (error) return { orgDomains: [], propertyDomains: [], error: error.message };

  const rows: OrgDomain[] = (data || []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    domain: d.domain as string,
    domain_type: (d.domain_type as string) || 'subdomain',
    status: d.status as string,
    ssl_status: (d.ssl_status as string) ?? null,
    is_primary: d.is_primary as boolean,
    property_id: (d.property_id as string) ?? null,
    property_name: (d.properties as { name: string } | null)?.name ?? null,
    verified_at: (d.verified_at as string) ?? null,
    created_at: d.created_at as string,
    verification_token: (d.verification_token as string) ?? null,
  }));

  const orgDomains = rows.filter((r) => r.property_id === null);
  const propertyDomains = rows.filter((r) => r.property_id !== null);

  return { orgDomains, propertyDomains };
}

export async function getPropertiesForDomains(): Promise<{
  properties: PropertyForDomains[];
  error?: string;
}> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { properties: [], error: 'No org context' };

  const { data, error } = await supabase
    .from('properties')
    .select('id, name, slug, primary_custom_domain_id')
    .eq('org_id', tenant.orgId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) return { properties: [], error: error.message };
  return { properties: (data || []) as PropertyForDomains[] };
}
