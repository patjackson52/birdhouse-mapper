import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdapter } from '@/lib/notifications/adapters';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch pending external notifications
  const { data: pending, error: fetchError } = await supabase
    .from('notifications')
    .select('id, user_id, channel, title, body')
    .eq('status', 'pending')
    .neq('channel', 'in_app')
    .limit(50);

  if (fetchError) {
    console.error('Failed to fetch pending notifications:', fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 });
  }

  let processed = 0;
  let failed = 0;

  for (const notification of pending) {
    const adapter = getAdapter(notification.channel);
    if (!adapter) {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: `No adapter for channel: ${notification.channel}` })
        .eq('id', notification.id);
      failed++;
      continue;
    }

    // Look up contact info
    let to = '';
    if (notification.channel === 'email') {
      const { data: authData } = await supabase.auth.admin.getUserById(notification.user_id);
      to = authData?.user?.email ?? '';
    } else if (notification.channel === 'sms') {
      const { data: profile } = await supabase
        .from('users')
        .select('phone')
        .eq('id', notification.user_id);
      to = (profile as { phone: string } | null)?.phone ?? '';
    }

    if (!to) {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: `No contact info for channel: ${notification.channel}` })
        .eq('id', notification.id);
      failed++;
      continue;
    }

    const result = await adapter.send({
      to,
      title: notification.title,
      body: notification.body ?? '',
    });

    if (result.success) {
      await supabase
        .from('notifications')
        .update({ status: 'sent' })
        .eq('id', notification.id);
      processed++;
    } else {
      await supabase
        .from('notifications')
        .update({ status: 'failed', error: result.error ?? 'Unknown error' })
        .eq('id', notification.id);
      failed++;
    }
  }

  return NextResponse.json({ processed, failed });
}
