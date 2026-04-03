'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { resolveChannelsForUser } from './preferences';
import type { NotifyParams, NotificationChannel } from './types';

export async function notify(params: NotifyParams): Promise<void> {
  const { orgId, type, title, body, referenceType, referenceId, recipients } = params;
  const supabase = createServiceClient();

  const userIdSet = new Set<string>(recipients.userIds ?? []);

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

  const userIds = Array.from(userIdSet);
  if (userIds.length === 0) return;

  // Batch-fetch all preferences for resolved users in one query
  const { data: allPrefs } = await supabase
    .from('user_notification_preferences')
    .select('user_id, channel, notification_type, enabled')
    .eq('org_id', orgId)
    .in('user_id', userIds);

  const prefsByUser = new Map<string, typeof allPrefs>();
  for (const pref of allPrefs ?? []) {
    const existing = prefsByUser.get(pref.user_id) ?? [];
    existing.push(pref);
    prefsByUser.set(pref.user_id, existing);
  }

  const rows: {
    org_id: string;
    user_id: string;
    type: string;
    title: string;
    body: string | null;
    reference_type: string;
    reference_id: string;
    channel: NotificationChannel;
    status: 'sent' | 'pending';
  }[] = [];

  for (const userId of userIds) {
    const channels = resolveChannelsForUser(prefsByUser.get(userId) ?? [], type);

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

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) {
    console.error('Failed to insert notifications:', error);
    return;
  }

  // Fire-and-forget dispatch for external channels
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
