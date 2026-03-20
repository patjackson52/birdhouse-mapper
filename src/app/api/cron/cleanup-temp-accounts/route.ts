import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron job: Clean up stale temporary/unconfirmed accounts.
 *
 * Runs every hour (configured in vercel.json).
 * Deletes auth users that:
 *   - Have no confirmed email (email_confirmed_at IS NULL)
 *   - Were created more than 24 hours ago
 *
 * Cascading deletes in the DB schema ensure related profiles
 * and data are cleaned up automatically.
 */
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // List all users
    const { data: usersData, error: listError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (listError) {
      console.error('Failed to list users:', listError.message);
      return NextResponse.json(
        { error: 'Failed to list users' },
        { status: 500 }
      );
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    let deletedCount = 0;

    for (const user of usersData.users) {
      // Skip users with confirmed emails
      if (user.email_confirmed_at) continue;

      // Skip recently created users (give them time to confirm)
      const createdAt = new Date(user.created_at);
      if (createdAt > cutoff) continue;

      // Delete the stale unconfirmed account
      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        user.id
      );

      if (deleteError) {
        console.error(
          `Failed to delete user ${user.id}:`,
          deleteError.message
        );
      } else {
        deletedCount++;
        console.log(`Deleted stale unconfirmed user: ${user.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error('Cleanup cron error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
