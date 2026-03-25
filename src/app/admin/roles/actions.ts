'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function getRoles() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', roles: [] };

  const { data, error } = await supabase
    .from('roles')
    .select('id, name, description, base_role, permissions, is_system_role, color, icon, sort_order')
    .eq('org_id', tenant.orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return { error: error.message, roles: [] };

  return { roles: data || [] };
}

export async function createRole(
  name: string,
  baseRoleId: string,
  permissions: Record<string, unknown>,
) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Fetch the base role to clone from
  const { data: baseRole, error: baseRoleError } = await supabase
    .from('roles')
    .select('id, base_role, is_system_role')
    .eq('id', baseRoleId)
    .eq('org_id', tenant.orgId)
    .single();

  if (baseRoleError || !baseRole) return { error: 'Base role not found' };
  if (baseRole.base_role === 'platform_admin') {
    return { error: 'Cannot clone a platform_admin role' };
  }

  const { data, error } = await supabase
    .from('roles')
    .insert({
      org_id: tenant.orgId,
      name,
      base_role: baseRole.base_role,
      permissions,
      is_system_role: false,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  return { id: data.id };
}

export async function updateRole(
  roleId: string,
  updates: { name?: string; description?: string; permissions?: Record<string, unknown> },
) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Verify the role exists in this org and is not a system role
  const { data: existing, error: fetchError } = await supabase
    .from('roles')
    .select('id, is_system_role')
    .eq('id', roleId)
    .eq('org_id', tenant.orgId)
    .single();

  if (fetchError || !existing) return { error: 'Role not found' };
  if (existing.is_system_role) return { error: 'Cannot edit a system role' };

  const { error } = await supabase
    .from('roles')
    .update(updates)
    .eq('id', roleId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function deleteRole(roleId: string) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Verify the role exists in this org and is not a system role
  const { data: existing, error: fetchError } = await supabase
    .from('roles')
    .select('id, is_system_role')
    .eq('id', roleId)
    .eq('org_id', tenant.orgId)
    .single();

  if (fetchError || !existing) return { error: 'Role not found' };
  if (existing.is_system_role) return { error: 'Cannot delete a system role' };

  // Check usage count before deleting
  const { orgMemberCount, propertyMemberCount, total } = await getRoleUsageCountInternal(
    supabase,
    tenant.orgId,
    roleId,
  );

  if (total > 0) {
    return {
      error: `Role is used by ${total} members. Reassign them before deleting.`,
    };
  }

  const { error } = await supabase
    .from('roles')
    .delete()
    .eq('id', roleId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function getRoleUsageCount(roleId: string) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const counts = await getRoleUsageCountInternal(supabase, tenant.orgId, roleId);
  return counts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createClient>;

async function getRoleUsageCountInternal(
  supabase: SupabaseClient,
  orgId: string,
  roleId: string,
): Promise<{ orgMemberCount: number; propertyMemberCount: number; total: number }> {
  const [{ count: orgCount }, { count: propCount }] = await Promise.all([
    supabase
      .from('org_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role_id', roleId),
    supabase
      .from('property_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role_id', roleId),
  ]);

  const orgMemberCount = orgCount ?? 0;
  const propertyMemberCount = propCount ?? 0;

  return {
    orgMemberCount,
    propertyMemberCount,
    total: orgMemberCount + propertyMemberCount,
  };
}
