'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { resolveChannelsForUser } from './preferences';
import type { NotifyParams, NotificationChannel } from './types';

export async function notify(params: NotifyParams): Promise<void> {
  const { orgId, type, title, body, referenceType, referenceId, recipients } = params;
  const supabase = createServiceClient();

  // Step 1: Collect all user IDs
  const userIdSet = new Set<string>(recipients.userIds ?? []);

  // Resolve role IDs → user IDs
  if (recipients.roleIds && recipients.roleIds.length > 0) {
    const { data: memberships } = await supabase
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role_id', recipients.roleIds);

    if (memberships) {
      for (const m of memberships) {
        if (m.user_id) userIdSet.add(m.user_id);
      }
    }
  }

  const userIds = [...userIdSet];
  if (userIds.length === 0) return;

  // Step 2: For each user, resolve channel preferences and create notifications
  const rows: Record<string, unknown>[] = [];

  for (const userId of userIds) {
    const { data: prefs } = await supabase
      .from('user_notification_preferences')
      .select('channel, notification_type, enabled')
      .eq('user_id', userId)
      .eq('org_id', orgId);

    const channels = resolveChannelsForUser(prefs ?? [], type);

    for (const [channel, enabled] of Object.entries(channels)) {
      if (!enabled) continue;

      rows.push({
        org_id: orgId,
        user_id: userId,
        type,
        title,
        body: body ?? null,
        reference_type: referenceType,
        reference_id: referenceId,
        channel: channel as NotificationChannel,
        status: channel === 'in_app' ? 'sent' : 'pending',
      });
    }
  }

  if (rows.length === 0) return;

  // Step 3: Bulk insert
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) {
    console.error('Failed to insert notifications:', error);
    return;
  }

  // Step 4: Trigger dispatch for external channels (fire-and-forget)
  const hasPending = rows.some((r) => r.status === 'pending');
  if (hasPending) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000';
    const url = `${baseUrl}/api/notifications/dispatch`;
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch((err) => {
      console.error('Failed to trigger notification dispatch:', err);
    });
  }
}
