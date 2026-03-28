'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { generateToken, hashToken } from '@/lib/invites/tokens';
import { INVITE_LINK_TTL_MS, MAX_ACTIVE_INVITES } from '@/lib/invites/constants';
import type { SupabaseClient } from '@supabase/supabase-js';

async function isOrgAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: userRow } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', userId)
    .single();

  if (userRow?.is_platform_admin) return true;

  const { data } = await supabase
    .from('org_memberships')
    .select('id, roles!inner(base_role)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('roles.base_role', 'org_admin')
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function getInviteRoles() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', roles: [] };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', roles: [] };

  const service = createServiceClient();
  const { data, error } = await service
    .from('roles')
    .select('id, name, base_role, permissions')
    .eq('org_id', tenant.orgId)
    .in('base_role', ['org_staff', 'contributor', 'viewer'])
    .order('sort_order', { ascending: true });

  if (error) return { error: error.message, roles: [] };
  return { roles: data || [] };
}

export async function createInvite(opts: {
  displayName: string | null;
  sessionExpiresAt: string;
  convertible: boolean;
  roleId: string;
}) {
  const supabase = createClient();
  const service = createServiceClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!(await isOrgAdmin(supabase, user.id))) {
    return { error: 'Admin access required' };
  }

  // Validate the role belongs to this org
  const { data: role } = await service
    .from('roles')
    .select('id')
    .eq('id', opts.roleId)
    .eq('org_id', tenant.orgId)
    .single();

  if (!role) return { error: 'Invalid role for this organization' };

  const { count } = await service
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString());

  if ((count ?? 0) >= MAX_ACTIVE_INVITES) {
    return { error: `Maximum ${MAX_ACTIVE_INVITES} active invites allowed` };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_LINK_TTL_MS).toISOString();

  const { error: insertError } = await service
    .from('invites')
    .insert({
      org_id: tenant.orgId,
      token: tokenHash,
      created_by: user.id,
      display_name: opts.displayName || null,
      role_id: opts.roleId,
      convertible: opts.convertible,
      session_expires_at: opts.sessionExpiresAt,
      expires_at: expiresAt,
    });

  if (insertError) {
    return { error: `Failed to create invite: ${insertError.message}` };
  }

  return { token: rawToken, expiresAt };
}

export async function getInvites() {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!(await isOrgAdmin(supabase, user.id))) {
    return { error: 'Admin access required' };
  }

  const { data, error } = await service
    .from('invites')
    .select(`
      id, display_name, convertible,
      session_expires_at, expires_at,
      claimed_by, claimed_at, created_at,
      role_id, roles!invites_role_id_fkey ( name )
    `)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  const claimedIds = data
    .filter((i) => i.claimed_by)
    .map((i) => i.claimed_by!);

  let profileMap: Record<string, string> = {};
  if (claimedIds.length > 0) {
    const { data: profiles } = await service
      .from('users')
      .select('id, display_name')
      .in('id', claimedIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, p.display_name || 'Guest'])
      );
    }
  }

  return {
    invites: data.map((invite) => ({
      ...invite,
      roles: (invite as any).roles as { name: string } | null,
      claimed_display_name: invite.claimed_by
        ? profileMap[invite.claimed_by] || 'Guest'
        : null,
    })),
  };
}

export async function convertAccount(opts: {
  userId: string;
  email: string;
  password: string;
}) {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!(await isOrgAdmin(supabase, user.id))) {
    return { error: 'Admin access required' };
  }

  // Verify target user is temporary and their invite is convertible
  const { data: targetProfile } = await service
    .from('users')
    .select('is_temporary, invite_id')
    .eq('id', opts.userId)
    .single();

  if (!targetProfile?.is_temporary) {
    return { error: 'User is not a temporary account' };
  }

  if (targetProfile.invite_id) {
    const { data: invite } = await service
      .from('invites')
      .select('convertible')
      .eq('id', targetProfile.invite_id)
      .single();

    if (!invite?.convertible) {
      return { error: 'This invite does not allow conversion to permanent account' };
    }
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    opts.userId,
    { email: opts.email, password: opts.password }
  );

  if (updateError) {
    return { error: `Failed to convert account: ${updateError.message}` };
  }

  const { error: profileError } = await service
    .from('users')
    .update({
      is_temporary: false,
      session_expires_at: null,
    })
    .eq('id', opts.userId);

  if (profileError) {
    return { error: `Failed to update profile: ${profileError.message}` };
  }

  return { success: true };
}

export async function revokeAccess(userId: string) {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!(await isOrgAdmin(supabase, user.id))) {
    return { error: 'Admin access required' };
  }

  const { error } = await service
    .from('users')
    .update({ session_expires_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('is_temporary', true);

  if (error) {
    return { error: `Failed to revoke access: ${error.message}` };
  }

  return { success: true };
}
