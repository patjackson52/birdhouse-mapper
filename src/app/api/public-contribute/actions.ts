'use server';

import { createClient } from '@/lib/supabase/server';
import { uploadToVault } from '@/lib/vault/actions';
import { moderateText } from '@/lib/moderation/moderate';

const MAX_UPLOADS_PER_HOUR = 10;

interface PublicContributionInput {
  orgId: string;
  itemId?: string | null;
  file: { name: string; type: string; size: number; base64: string };
  description?: string;
  anonName?: string | null;
}

export async function submitPublicContribution(
  input: PublicContributionInput,
): Promise<{ success: true; status: string } | { error: string }> {
  const supabase = createClient();

  // Normalize the optional anon nickname: trim, clamp to 80 chars, coerce
  // empty/whitespace to null. Defense-in-depth on top of client trimming.
  const anon_name = (input.anonName ?? '').trim().slice(0, 80) || null;

  // 1. Check org allows public contributions
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, allow_public_contributions, moderation_mode')
    .eq('id', input.orgId)
    .single();

  if (orgError || !org) return { error: 'Organization not found.' };
  if (!org.allow_public_contributions) return { error: 'This organization is not accepting public contributions.' };

  // 2. Get or create anonymous user
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError || !signInData.user) return { error: 'Failed to create session.' };
    user = signInData.user;
  }

  // 3. Get or create org membership with public_contributor role
  const { data: existingMembership } = await supabase
    .from('org_memberships')
    .select('id, status, role_id, upload_count_this_hour, last_upload_window_start')
    .eq('user_id', user.id)
    .eq('org_id', input.orgId)
    .maybeSingle();

  if (existingMembership?.status === 'banned') {
    return { error: 'Your account has been restricted from contributing to this organization.' };
  }

  let membershipId = existingMembership?.id;

  if (!existingMembership) {
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('org_id', input.orgId)
      .eq('base_role', 'public_contributor')
      .single();

    if (!role) return { error: 'Public contributor role not configured.' };

    const { data: newMembership, error: membershipError } = await supabase
      .from('org_memberships')
      .insert({
        org_id: input.orgId,
        user_id: user.id,
        role_id: role.id,
        status: 'active',
      })
      .select('id')
      .single();

    if (membershipError || !newMembership) return { error: 'Failed to create membership.' };
    membershipId = newMembership.id;
  }

  // 4. Rate limit check
  if (existingMembership) {
    const windowStart = existingMembership.last_upload_window_start
      ? new Date(existingMembership.last_upload_window_start)
      : null;
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (windowStart && windowStart > hourAgo && existingMembership.upload_count_this_hour >= MAX_UPLOADS_PER_HOUR) {
      return { error: 'Upload limit reached. Please try again later.' };
    }

    const newCount = (windowStart && windowStart > hourAgo)
      ? existingMembership.upload_count_this_hour + 1
      : 1;
    const newWindowStart = (windowStart && windowStart > hourAgo)
      ? existingMembership.last_upload_window_start
      : now.toISOString();

    await supabase
      .from('org_memberships')
      .update({
        upload_count_this_hour: newCount,
        last_upload_window_start: newWindowStart,
      })
      .eq('id', existingMembership.id);
  }

  // 5. Moderate text if provided
  if (input.description?.trim()) {
    try {
      const textResult = await moderateText(input.description);
      if (textResult.flagged) {
        return { error: "Your submission couldn't be posted because it doesn't meet our content guidelines." };
      }
    } catch {
      // Text moderation failed — proceed (image moderation will catch if needed)
    }
  }

  // 6. Upload with moderation
  const result = await uploadToVault({
    orgId: input.orgId,
    file: input.file,
    category: 'photo',
    visibility: 'public',
    moderateAsPublicContribution: true,
    orgModerationMode: org.moderation_mode as 'auto_approve' | 'manual_review',
    metadata: input.description ? { description: input.description } : {},
  });

  if ('error' in result) return { error: result.error };

  // 7. If the contribution is tied to a specific item, record an item_update
  //    row so the photo appears on that item's timeline with the anon nickname.
  if (input.itemId) {
    await supabase.from('item_updates').insert({
      org_id: input.orgId,
      item_id: input.itemId,
      created_by: user.id,
      vault_item_id: result.item.id,
      description: input.description?.trim() || null,
      anon_name,
    });
  }

  return {
    success: true,
    status: result.item.moderation_status,
  };
}
