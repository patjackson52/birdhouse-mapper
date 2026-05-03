'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function getOrgMembers() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', members: [] };

  const { data, error } = await supabase
    .from('org_memberships')
    .select(`
      id,
      joined_at,
      user_id,
      users!user_id ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');

  if (error) return { error: error.message, members: [] };

  // Count property_memberships per user
  const userIds = (data || []).map((m) => m.user_id).filter(Boolean) as string[];

  let propertyCounts: Record<string, number> = {};
  if (userIds.length > 0) {
    const { data: pmData } = await supabase
      .from('property_memberships')
      .select('user_id')
      .eq('org_id', tenant.orgId)
      .in('user_id', userIds);

    if (pmData) {
      for (const pm of pmData) {
        propertyCounts[pm.user_id] = (propertyCounts[pm.user_id] || 0) + 1;
      }
    }
  }

  const members = (data || []).map((m) => {
    const user = m.users as unknown as { id: string; display_name: string; email: string } | null;
    const role = m.roles as unknown as { id: string; name: string; base_role: string } | null;
    return {
      membership_id: m.id,
      user_id: user?.id ?? m.user_id,
      display_name: user?.display_name ?? '',
      email: user?.email ?? '',
      role_name: role?.name ?? '',
      role_base_role: role?.base_role ?? '',
      joined_at: m.joined_at,
      property_count: propertyCounts[m.user_id ?? ''] ?? 0,
    };
  });

  return { members };
}

export async function inviteMember(email: string, roleId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('org_memberships')
    .insert({
      org_id: tenant.orgId,
      status: 'invited',
      invited_email: email.trim().toLowerCase(),
      role_id: roleId,
      invited_by: user.id,
    });

  if (error) {
    if (error.code === '23505') return { error: 'This email has already been invited' };
    return { error: error.message };
  }

  return { success: true };
}

export async function updateMemberRole(membershipId: string, newRoleId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Check last-admin guardrail
  const lastAdminError = await checkLastAdmin(supabase, tenant.orgId, membershipId);
  if (lastAdminError) return { error: lastAdminError };

  const { error } = await supabase
    .from('org_memberships')
    .update({ role_id: newRoleId })
    .eq('id', membershipId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function removeMember(membershipId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Check last-admin guardrail
  const lastAdminError = await checkLastAdmin(supabase, tenant.orgId, membershipId);
  if (lastAdminError) return { error: lastAdminError };

  const { error } = await supabase
    .from('org_memberships')
    .delete()
    .eq('id', membershipId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getMemberDetail(userId: string) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Get the user's org_membership with role
  const { data: membership, error: memError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      status,
      joined_at,
      users ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('user_id', userId)
    .single();

  if (memError) return { error: memError.message };

  // Get all properties in the org
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, slug')
    .eq('org_id', tenant.orgId)
    .is('deleted_at', null)
    .order('name');

  // Get all property_memberships for this user in this org
  const { data: propertyMemberships } = await supabase
    .from('property_memberships')
    .select(`
      id,
      property_id,
      grant_type,
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('user_id', userId);

  const user = membership.users as unknown as { id: string; display_name: string; email: string } | null;
  const role = membership.roles as unknown as { id: string; name: string; base_role: string } | null;

  return {
    success: true,
    data: {
      membership_id: membership.id,
      user_id: user?.id ?? userId,
      display_name: user?.display_name ?? '',
      email: user?.email ?? '',
      status: membership.status,
      joined_at: membership.joined_at,
      role: role ? { id: role.id, name: role.name, base_role: role.base_role } : null,
      properties: (properties || []).map((p) => {
        const pm = (propertyMemberships || []).find((pm) => pm.property_id === p.id);
        const pmRole = pm?.roles as unknown as { id: string; name: string; base_role: string } | null;
        return {
          property_id: p.id,
          name: p.name,
          slug: p.slug,
          membership: pm
            ? {
                id: pm.id,
                grant_type: pm.grant_type,
                role_name: pmRole?.name ?? '',
                role_base_role: pmRole?.base_role ?? '',
              }
            : null,
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * If the membership being modified belongs to an org_admin, verify that at
 * least one *other* active org_admin exists. Returns an error string or null.
 */
async function checkLastAdmin(
  supabase: SupabaseClient,
  orgId: string,
  membershipId: string,
): Promise<string | null> {
  // Fetch the membership + its role
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('id, user_id, roles ( base_role )')
    .eq('id', membershipId)
    .eq('org_id', orgId)
    .single();

  if (!membership) return null; // nothing to guard

  const role = membership.roles as unknown as { base_role: string } | null;
  if (role?.base_role !== 'org_admin') return null; // not an admin — no guard needed

  // Count other active org_admin memberships
  const { count } = await supabase
    .from('org_memberships')
    .select('id, roles!inner( base_role )', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')
    .eq('roles.base_role', 'org_admin')
    .neq('id', membershipId);

  if ((count ?? 0) === 0) {
    return 'Cannot change the role of the last org admin';
  }

  return null;
}
