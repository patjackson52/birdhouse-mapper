// src/lib/communications/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { CommunicationTopic } from './types';

// ---------------------------------------------------------------------------
// Topic CRUD (org admin)
// ---------------------------------------------------------------------------

export async function createTopic(input: {
  org_id: string;
  property_id?: string;
  name: string;
  description?: string;
  sort_order?: number;
}): Promise<{ success: true; topic: CommunicationTopic } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('communication_topics')
    .insert({
      org_id: input.org_id,
      property_id: input.property_id ?? null,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      is_active: true,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, topic: data };
}

export async function updateTopic(
  topicId: string,
  updates: {
    name?: string;
    description?: string;
    is_active?: boolean;
    sort_order?: number;
  }
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description.trim();
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  if (Object.keys(payload).length === 0) return { success: true };

  const { error } = await supabase
    .from('communication_topics')
    .update(payload)
    .eq('id', topicId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteTopic(topicId: string): Promise<{ success: true } | { error: string }> {
  // Soft delete: deactivate rather than removing
  return updateTopic(topicId, { is_active: false });
}

// ---------------------------------------------------------------------------
// User subscriptions
// ---------------------------------------------------------------------------

export async function subscribe(topicIds: string[]): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (topicIds.length === 0) return { success: true };

  const rows = topicIds.map((topic_id) => ({
    user_id: user.id,
    topic_id,
    email_enabled: true,
    in_app_enabled: true,
  }));

  const { error } = await supabase
    .from('user_subscriptions')
    .upsert(rows, { onConflict: 'user_id,topic_id' });

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateSubscription(
  subscriptionId: string,
  updates: { email_enabled?: boolean; in_app_enabled?: boolean }
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('user_subscriptions')
    .update(updates)
    .eq('id', subscriptionId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unsubscribeAll(): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('user_subscriptions')
    .update({ email_enabled: false, in_app_enabled: false })
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markNotificationRead(notificationId: string): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) return { error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Send notification (org admin)
// ---------------------------------------------------------------------------

export async function sendNotification(input: {
  org_id: string;
  property_id?: string;
  topic_ids: string[];
  title: string;
  body: string;
  link?: string;
  channels: ('email' | 'in_app')[];
}): Promise<{ success: true; sent: { email: number; inApp: number } } | { error: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (input.topic_ids.length === 0) return { error: 'At least one topic is required' };
  if (!input.title.trim()) return { error: 'Title is required' };
  if (!input.body.trim()) return { error: 'Body is required' };
  if (input.channels.length === 0) return { error: 'At least one channel is required' };

  // Rate limit: check if a notification was sent to any of these topics in the last hour
  const { data: recentSends } = await supabase
    .from('notification_sends')
    .select('id')
    .in('topic_id', input.topic_ids)
    .gte('sent_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentSends && recentSends.length > 0) {
    return { error: 'A notification was already sent to one of these topics in the last hour. Please wait before sending again.' };
  }

  // Get subscribers for the selected topics
  const { data: subscribers, error: subError } = await supabase
    .from('user_subscriptions')
    .select('user_id, topic_id, email_enabled, in_app_enabled')
    .in('topic_id', input.topic_ids);

  if (subError) return { error: subError.message };
  if (!subscribers || subscribers.length === 0) return { error: 'No subscribers found for the selected topics' };

  // Deduplicate by user_id (a user might subscribe to multiple selected topics)
  const userMap = new Map<string, { email: boolean; inApp: boolean; topicId: string }>();
  for (const sub of subscribers) {
    const existing = userMap.get(sub.user_id);
    if (!existing) {
      userMap.set(sub.user_id, {
        email: sub.email_enabled,
        inApp: sub.in_app_enabled,
        topicId: sub.topic_id,
      });
    } else {
      // Merge: if any subscription has the channel enabled, keep it enabled
      if (sub.email_enabled) existing.email = true;
      if (sub.in_app_enabled) existing.inApp = true;
    }
  }

  let emailCount = 0;
  let inAppCount = 0;
  const notificationRows: Array<{
    user_id: string;
    org_id: string;
    property_id: string | null;
    topic_id: string;
    title: string;
    body: string;
    link: string | null;
  }> = [];
  const sendRows: Array<{
    notification_id: string | null;
    user_id: string;
    topic_id: string;
    channel: 'email' | 'in_app';
    status: 'pending' | 'sent' | 'failed';
    sent_at: string;
  }> = [];

  const now = new Date().toISOString();

  // Create in-app notifications
  if (input.channels.includes('in_app')) {
    for (const [userId, prefs] of Array.from(userMap)) {
      if (prefs.inApp) {
        notificationRows.push({
          user_id: userId,
          org_id: input.org_id,
          property_id: input.property_id ?? null,
          topic_id: prefs.topicId,
          title: input.title.trim(),
          body: input.body.trim(),
          link: input.link?.trim() || null,
        });
      }
    }

    if (notificationRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('notifications')
        .insert(notificationRows)
        .select('id, user_id');

      if (insertError) return { error: insertError.message };

      for (const notif of inserted ?? []) {
        const prefs = userMap.get(notif.user_id);
        sendRows.push({
          notification_id: notif.id,
          user_id: notif.user_id,
          topic_id: prefs!.topicId,
          channel: 'in_app',
          status: 'sent',
          sent_at: now,
        });
        inAppCount++;
      }
    }
  }

  // Send emails via Resend
  if (input.channels.includes('email')) {
    // Dynamic import to avoid loading Resend in non-email paths
    const { sendNotificationEmail } = await import('@/lib/email/resend');

    for (const [userId, prefs] of Array.from(userMap)) {
      if (prefs.email) {
        try {
          await sendNotificationEmail({
            userId,
            orgId: input.org_id,
            topicId: prefs.topicId,
            title: input.title.trim(),
            body: input.body.trim(),
            link: input.link?.trim() || null,
          });
          sendRows.push({
            notification_id: null,
            user_id: userId,
            topic_id: prefs.topicId,
            channel: 'email',
            status: 'sent',
            sent_at: now,
          });
          emailCount++;
        } catch (err) {
          sendRows.push({
            notification_id: null,
            user_id: userId,
            topic_id: prefs.topicId,
            channel: 'email',
            status: 'failed',
            sent_at: now,
          });
        }
      }
    }
  }

  // Record send audit trail
  if (sendRows.length > 0) {
    await supabase.from('notification_sends').insert(sendRows);
  }

  return { success: true, sent: { email: emailCount, inApp: inAppCount } };
}
