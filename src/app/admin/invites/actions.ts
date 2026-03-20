'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateToken, hashToken } from '@/lib/invites/tokens';
import { INVITE_LINK_TTL_MS, MAX_ACTIVE_INVITES } from '@/lib/invites/constants';

export async function createInvite(opts: {
  displayName: string | null;
  sessionExpiresAt: string;
  convertible: boolean;
}) {
  const supabase = createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

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
      token: tokenHash,
      created_by: user.id,
      display_name: opts.displayName || null,
      role: 'editor',
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  const { data, error } = await service
    .from('invites')
    .select(`
      id, display_name, role, convertible,
      session_expires_at, expires_at,
      claimed_by, claimed_at, created_at
    `)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  const claimedIds = data
    .filter((i) => i.claimed_by)
    .map((i) => i.claimed_by!);

  let profileMap: Record<string, string> = {};
  if (claimedIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
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

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!adminProfile || adminProfile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    opts.userId,
    { email: opts.email, password: opts.password }
  );

  if (updateError) {
    return { error: `Failed to convert account: ${updateError.message}` };
  }

  const { error: profileError } = await service
    .from('profiles')
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

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!adminProfile || adminProfile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  const { error } = await service
    .from('profiles')
    .update({ session_expires_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return { error: `Failed to revoke access: ${error.message}` };
  }

  return { success: true };
}
