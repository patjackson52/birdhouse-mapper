'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

async function requireOrgAdmin() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) throw new Error('No org context');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const };

  // Check platform admin
  const { data: userRow } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!userRow?.is_platform_admin) {
    const { data } = await supabase
      .from('org_memberships')
      .select('id, roles!inner(base_role)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('roles.base_role', 'org_admin')
      .limit(1);

    if ((data?.length ?? 0) === 0) {
      return { error: 'Admin access required' as const };
    }
  }

  return { user, tenant, supabase };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createQrCode(opts: {
  propertyId: string;
  propertySlug: string;
  placement: string;
  label?: string;
}) {
  const auth = await requireOrgAdmin();
  if ('error' in auth) return auth;
  const { tenant } = auth;
  const service = createServiceClient();

  const slug = `${slugify(opts.propertySlug)}-${slugify(opts.placement)}`;

  const { error } = await service
    .from('redirects')
    .insert({
      slug,
      destination_url: '/', // Not used when property_id is set, but column is NOT NULL
      org_id: tenant.orgId,
      property_id: opts.propertyId,
      placement: opts.placement,
      label: opts.label || opts.placement,
      scan_count: 0,
    });

  if (error) {
    if (error.code === '23505') {
      return { error: 'A QR code with this placement already exists for this property' };
    }
    return { error: `Failed to create QR code: ${error.message}` };
  }

  return { success: true, slug };
}

export async function getQrCodes(propertyId: string) {
  const auth = await requireOrgAdmin();
  if ('error' in auth) return auth;
  const service = createServiceClient();

  const { data, error } = await service
    .from('redirects')
    .select('slug, placement, label, scan_count, created_at')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { qrCodes: data || [] };
}

export async function deleteQrCode(slug: string) {
  const auth = await requireOrgAdmin();
  if ('error' in auth) return auth;
  const { tenant } = auth;
  const service = createServiceClient();

  const { error } = await service
    .from('redirects')
    .delete()
    .eq('slug', slug)
    .eq('org_id', tenant.orgId);

  if (error) return { error: `Failed to delete: ${error.message}` };
  return { success: true };
}

export async function getQrCodeStats(slug: string) {
  const auth = await requireOrgAdmin();
  if ('error' in auth) return auth;
  const service = createServiceClient();

  // Get daily scan counts for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await service
    .from('redirect_scans')
    .select('scanned_at')
    .eq('redirect_slug', slug)
    .gte('scanned_at', thirtyDaysAgo.toISOString())
    .order('scanned_at', { ascending: true });

  if (error) return { error: error.message };

  // Group by day
  const dailyCounts: Record<string, number> = {};
  for (const scan of data || []) {
    const day = scan.scanned_at.slice(0, 10); // YYYY-MM-DD
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  }

  return { dailyCounts };
}
