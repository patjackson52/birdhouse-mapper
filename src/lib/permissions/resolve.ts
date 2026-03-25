import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role, RolePermissions } from '../types';

export interface ResolvedAccess {
  role: Role;
  permissions: RolePermissions;
  source: 'platform_admin' | 'org_admin' | 'property_membership' | 'org_membership' | 'temporary_grant';
}

/**
 * Check if a resolved access grant permits a specific action.
 * Platform admins and org admins bypass all permission checks.
 */
export function hasPermission(
  access: ResolvedAccess,
  category: keyof RolePermissions,
  action: string
): boolean {
  if (access.source === 'platform_admin' || access.source === 'org_admin') {
    return true;
  }
  const categoryPerms = access.permissions[category];
  if (!categoryPerms || typeof categoryPerms !== 'object') return false;
  return (categoryPerms as Record<string, boolean>)[action] ?? false;
}

/**
 * Resolve the effective access for a user on a property.
 * Mirrors the PostgreSQL permission resolution hierarchy for UI use.
 *
 * Resolution order:
 * 1. Platform admin → full access
 * 2. Org admin → full access within org
 * 3. Property membership → explicit override
 * 4. Org membership → inherited role
 * 5. No access → null
 *
 * NOTE: For org_admins, the returned role is the org_admin role, not any
 * property_membership override. The org_admin bypass is intentional —
 * org_admins always have full access regardless of property_memberships.
 */
export async function resolveUserAccess(
  supabase: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<ResolvedAccess | null> {
  // 1. Check platform admin
  const { data: user } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', userId)
    .single();

  if (user?.is_platform_admin) {
    // Return a synthetic admin role — all permissions true
    const adminRole = await getOrgAdminRole(supabase, propertyId);
    if (adminRole) {
      return { role: adminRole, permissions: adminRole.permissions, source: 'platform_admin' };
    }
  }

  // Get property's org_id
  const { data: property } = await supabase
    .from('properties')
    .select('org_id')
    .eq('id', propertyId)
    .single();

  if (!property) return null;

  // 2. Check org_admin
  const { data: orgMembership } = await supabase
    .from('org_memberships')
    .select('id, role_id, roles(id, name, description, base_role, color, icon, permissions, is_default_new_member_role, is_public_role, is_system_role, sort_order, org_id, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('org_id', property.org_id)
    .eq('status', 'active')
    .single();

  const orgRole = orgMembership ? (orgMembership as any).roles as Role : null;

  if (orgRole?.base_role === 'org_admin') {
    return { role: orgRole, permissions: orgRole.permissions, source: 'org_admin' };
  }

  // 3. Check property membership override
  if (orgMembership) {
    const { data: propMembership } = await supabase
      .from('property_memberships')
      .select('role_id, roles(id, name, description, base_role, color, icon, permissions, is_default_new_member_role, is_public_role, is_system_role, sort_order, org_id, created_at, updated_at)')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .maybeSingle();

    if (propMembership) {
      const propRole = (propMembership as any).roles as Role;
      return { role: propRole, permissions: propRole.permissions, source: 'property_membership' };
    }
  }

  // 4. Fall back to org membership role
  if (orgRole) {
    return { role: orgRole, permissions: orgRole.permissions, source: 'org_membership' };
  }

  // 5. Check temporary access grants
  const { data: tempGrant } = await supabase
    .from('temporary_access_grants')
    .select('role_id, roles(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('valid_from', new Date().toISOString())
    .gt('valid_until', new Date().toISOString())
    .or(`property_id.eq.${propertyId},property_id.is.null`)
    .maybeSingle();

  if (tempGrant) {
    const tempRole = (tempGrant as any).roles as Role;
    return { role: tempRole, permissions: tempRole.permissions, source: 'temporary_grant' };
  }

  return null;
}

/** Helper to get the org_admin role for a property's org */
async function getOrgAdminRole(supabase: SupabaseClient, propertyId: string): Promise<Role | null> {
  const { data } = await supabase
    .from('properties')
    .select('org_id')
    .eq('id', propertyId)
    .single();

  if (!data) return null;

  const { data: role } = await supabase
    .from('roles')
    .select('*')
    .eq('org_id', data.org_id)
    .eq('base_role', 'org_admin')
    .single();

  return role as Role | null;
}
