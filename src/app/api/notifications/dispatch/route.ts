import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdapter } from '@/lib/notifications/adapters';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

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

  // Batch-fetch contact info for all unique users
  const uniqueUserIds = Array.from(new Set(pending.map((n) => n.user_id)));
  const emailMap = new Map<string, string>();
  const phoneMap = new Map<string, string>();

  const hasEmail = pending.some((n) => n.channel === 'email');
  const hasSms = pending.some((n) => n.channel === 'sms');

  if (hasEmail) {
    const results = await Promise.all(
      uniqueUserIds.map((id) => supabase.auth.admin.getUserById(id))
    );
    for (const { data } of results) {
      if (data?.user?.email) emailMap.set(data.user.id, data.user.email);
    }
  }

  if (hasSms) {
    const { data: profiles } = await supabase
      .from('users')
      .select('id, phone')
      .in('id', uniqueUserIds);
    for (const p of profiles ?? []) {
      if (p.phone) phoneMap.set(p.id, p.phone);
    }
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

    const to = notification.channel === 'email'
      ? emailMap.get(notification.user_id) ?? ''
      : phoneMap.get(notification.user_id) ?? '';

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
