'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/invites/tokens';

/**
 * Validate an invite token. Called on page load to render the landing page.
 * Uses service role because invites table has admin-only RLS.
 */
export async function validateInviteToken(rawToken: string) {
  const service = createServiceClient();
  const tokenHash = hashToken(rawToken);

  const { data: invite, error } = await service
    .from('invites')
    .select('id, display_name, session_expires_at, expires_at, claimed_by')
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

  return {
    valid: true,
    invite: {
      id: invite.id,
      display_name: invite.display_name,
      session_expires_at: invite.session_expires_at,
    },
  };
}

/**
 * Complete the claim after the client has already called signInAnonymously().
 * The client component handles signInAnonymously() directly (via the browser
 * Supabase client) so that session cookies are properly set. Then it passes
 * the resulting userId to this server action for profile creation and invite
 * claiming via service role.
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
    .select('id, display_name, role, session_expires_at, expires_at, claimed_by, convertible')
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
  // Note: users.role was dropped in migration 010; roles now live in org_memberships.
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
    // Clean up orphaned anonymous auth user
    await service.auth.admin.deleteUser(userId);
    return { error: `Failed to create profile: ${profileError.message}` };
  }

  // Mark invite as claimed
  const { error: claimError } = await service
    .from('invites')
    .update({
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (claimError) {
    // Clean up orphaned anonymous auth user and profile
    await service.from('users').delete().eq('id', userId);
    await service.auth.admin.deleteUser(userId);
    return { error: 'Failed to complete invite claim.' };
  }

  return { success: true, convertible: invite.convertible };
}
