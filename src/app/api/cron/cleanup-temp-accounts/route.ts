import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { CONVERSION_WINDOW_DAYS } from '@/lib/invites/constants';

/**
 * Cron job to clean up expired temporary accounts.
 * Called by Vercel Cron on schedule defined in vercel.json.
 */
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const conversionCutoff = new Date(
    Date.now() - CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Delete unclaimed expired invites
  const { error: deleteInvitesError } = await supabase
    .from('invites')
    .delete()
    .is('claimed_by', null)
    .lt('expires_at', now);

  if (deleteInvitesError) {
    console.error('Failed to delete expired invites:', deleteInvitesError);
  }

  // 2. Find expired temp profiles ready for cleanup
  const { data: expiredProfiles, error: profilesError } = await supabase
    .from('users')
    .select('id, invite_id')
    .eq('is_temporary', true)
    .is('deleted_at', null)
    .lt('session_expires_at', now);

  if (profilesError) {
    console.error('Failed to fetch expired profiles:', profilesError);
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  let cleaned = 0;
  for (const profile of expiredProfiles || []) {
    // Check if convertible and within conversion window
    if (profile.invite_id) {
      const { data: invite } = await supabase
        .from('invites')
        .select('convertible, session_expires_at')
        .eq('id', profile.invite_id)
        .single();

      if (
        invite?.convertible &&
        new Date(invite.session_expires_at) > new Date(conversionCutoff)
      ) {
        continue; // Still within conversion window
      }
    }

    // 3. Soft-delete the profile
    await supabase
      .from('users')
      .update({ deleted_at: now })
      .eq('id', profile.id);

    // 4. Delete the anonymous auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      profile.id
    );

    if (deleteError) {
      console.error(`Failed to delete auth user ${profile.id}:`, deleteError);
    } else {
      cleaned++;
    }
  }

  return NextResponse.json({
    message: `Cleanup complete. Cleaned ${cleaned} expired temp accounts.`,
  });
}
