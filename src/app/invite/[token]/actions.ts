'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/invites/tokens';

/** Human-readable capability labels for permissions */
const CAPABILITY_MAP: Record<string, string> = {
  'items.view': 'View items on the map',
  'items.create': 'Create new items',
  'items.edit_any': 'Edit any item',
  'items.edit_assigned': 'Edit items you created',
  'updates.create': 'Add observations',
  'updates.edit_own': 'Edit your observations',
  'attachments.upload': 'Upload photos',
};

/** Extract human-readable capabilities from a role's permissions JSONB */
function extractCapabilities(permissions: Record<string, Record<string, boolean>>): string[] {
  const caps: string[] = [];
  for (const [category, actions] of Object.entries(permissions)) {
    for (const [action, enabled] of Object.entries(actions)) {
      if (enabled && CAPABILITY_MAP[`${category}.${action}`]) {
        caps.push(CAPABILITY_MAP[`${category}.${action}`]);
      }
    }
  }
  return caps;
}

/**
 * Validate an invite token. Called on page load to render the landing page.
 * Uses service role because invites table has admin-only RLS.
 */
export async function validateInviteToken(rawToken: string) {
  const service = createServiceClient();
  const tokenHash = hashToken(rawToken);

  const { data: invite, error } = await service
    .from('invites')
    .select('id, display_name, session_expires_at, expires_at, claimed_by, roles ( name, permissions )')
    .eq('token', tokenHash)
    .single();

  if (error || !invite) {
    return { valid: false, reason: 'not_found' as const };
  }

  if (invite.claimed_by) {
    return { valid: false, reason: 'already_claimed' as const };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' as const };
  }

  const roleData = invite.roles as unknown as { name: string; permissions: Record<string, Record<string, boolean>> } | null;

  return {
    valid: true,
    invite: {
      id: invite.id,
      display_name: invite.display_name,
      session_expires_at: invite.session_expires_at,
      role_name: roleData?.name || 'Contributor',
      capabilities: roleData ? extractCapabilities(roleData.permissions) : [],
    },
  };
}

/**
 * Complete the claim after the client has already called signInAnonymously().
 */
export async function completeInviteClaim(
  rawToken: string,
  userId: string,
  displayName: string
) {
  const service = createServiceClient();
  const tokenHash = hashToken(rawToken);

  // Verify the userId belongs to an anonymous auth user
  const { data: authUser, error: authUserError } = await service.auth.admin.getUserById(userId);
  if (authUserError || !authUser?.user?.is_anonymous) {
    return { error: 'Invalid session. Please try again.' };
  }

  // Re-validate token (prevent race conditions)
  const { data: invite, error: inviteError } = await service
    .from('invites')
    .select('id, org_id, display_name, role_id, session_expires_at, expires_at, claimed_by, convertible')
    .eq('token', tokenHash)
    .single();

  if (inviteError || !invite) {
    return { error: 'Invite not found' };
  }

  if (invite.claimed_by) {
    return { error: 'This invite has already been claimed' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This invite has expired' };
  }

  const name = displayName.trim() || invite.display_name || 'Guest';

  // Insert profile via service role
  const { error: profileError } = await service
    .from('users')
    .insert({
      id: userId,
      display_name: name,
      is_temporary: true,
      session_expires_at: invite.session_expires_at,
      invite_id: invite.id,
    });

  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return { error: `Failed to create profile: ${profileError.message}` };
  }

  // Grant org membership using the invite's role_id directly
  await service.from('org_memberships').insert({
    org_id: invite.org_id,
    user_id: userId,
    role_id: invite.role_id,
    status: 'active',
    joined_at: new Date().toISOString(),
  });

  // Mark invite as claimed
  const { error: claimError } = await service
    .from('invites')
    .update({
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (claimError) {
    await service.from('users').delete().eq('id', userId);
    await service.auth.admin.deleteUser(userId);
    return { error: 'Failed to complete invite claim.' };
  }

  return { success: true, convertible: invite.convertible };
}
