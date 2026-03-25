'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export type PropertyMember = {
  user_id: string;
  display_name: string;
  email: string;
  org_role_id: string;
  org_role_name: string;
  org_role_base_role: string;
  // property override (null if none)
  property_membership_id: string | null;
  override_role_id: string | null;
  override_role_name: string | null;
  override_role_base_role: string | null;
  // resolved effective values
  effective_role_name: string;
  effective_role_base_role: string;
  has_override: boolean;
};

export async function getPropertyMembers(propertySlug: string): Promise<{
  property?: { id: string; name: string; slug: string };
  members?: PropertyMember[];
  error?: string;
}> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // 1. Resolve the property by slug
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, name, slug')
    .eq('org_id', tenant.orgId)
    .eq('slug', propertySlug)
    .is('deleted_at', null)
    .single();

  if (propError || !property) {
    return { error: propError?.message ?? 'Property not found' };
  }

  // 2. Fetch all active org members (with user + role)
  const { data: orgMemberships, error: orgError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      user_id,
      users ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');

  if (orgError) return { error: orgError.message };

  // 3. Fetch property_memberships for this property
  const { data: propertyMemberships, error: pmError } = await supabase
    .from('property_memberships')
    .select(`
      id,
      user_id,
      role_id,
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('property_id', property.id);

  if (pmError) return { error: pmError.message };

  // Index property overrides by user_id for fast lookup
  const overrideByUserId = new Map<string, typeof propertyMemberships[number]>();
  for (const pm of propertyMemberships ?? []) {
    if (pm.user_id) overrideByUserId.set(pm.user_id, pm);
  }

  // 4. Merge
  const members: PropertyMember[] = (orgMemberships ?? []).map((m) => {
    const user = m.users as unknown as { id: string; display_name: string; email: string } | null;
    const orgRole = m.roles as unknown as { id: string; name: string; base_role: string } | null;
    const userId = user?.id ?? m.user_id ?? '';

    const override = overrideByUserId.get(userId) ?? null;
    const overrideRole = override?.roles as unknown as { id: string; name: string; base_role: string } | null;

    const hasOverride = override !== null;

    return {
      user_id: userId,
      display_name: user?.display_name ?? '',
      email: user?.email ?? '',
      org_role_id: orgRole?.id ?? '',
      org_role_name: orgRole?.name ?? '',
      org_role_base_role: orgRole?.base_role ?? '',
      property_membership_id: override?.id ?? null,
      override_role_id: overrideRole?.id ?? null,
      override_role_name: overrideRole?.name ?? null,
      override_role_base_role: overrideRole?.base_role ?? null,
      effective_role_name: hasOverride ? (overrideRole?.name ?? '') : (orgRole?.name ?? ''),
      effective_role_base_role: hasOverride ? (overrideRole?.base_role ?? '') : (orgRole?.base_role ?? ''),
      has_override: hasOverride,
    };
  });

  return { property, members };
}

// Wrapper functions for override helpers — 'use server' files can only export async functions
export async function addPropertyOverrideForProperty(
  userId: string,
  propertyId: string,
  roleId: string
) {
  const { addPropertyOverride } = await import('@/app/admin/members/[userId]/actions');
  return addPropertyOverride(userId, propertyId, roleId);
}

export async function removePropertyOverrideForProperty(propertyMembershipId: string) {
  const { removePropertyOverride } = await import('@/app/admin/members/[userId]/actions');
  return removePropertyOverride(propertyMembershipId);
}
