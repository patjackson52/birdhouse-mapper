import { createClient } from '@/lib/supabase/server';
import type { CommunicationTopic, TopicWithCount, SubscriptionWithTopic } from './types';

export async function getActiveTopics(orgId: string, propertyId?: string): Promise<CommunicationTopic[]> {
  const supabase = createClient();
  let query = supabase
    .from('communication_topics')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (propertyId) {
    query = query.or(`property_id.is.null,property_id.eq.${propertyId}`);
  } else {
    query = query.is('property_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTopicsWithCounts(orgId: string): Promise<TopicWithCount[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('communication_topics')
    .select('*, user_subscriptions(count)')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((topic) => ({
    ...topic,
    subscriber_count: (topic as any).user_subscriptions?.[0]?.count ?? 0,
  }));
}

export async function getUserSubscriptions(userId: string): Promise<SubscriptionWithTopic[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*, topic:communication_topics(*)')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    topic: (row as any).topic,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count ?? 0;
}

export async function getUserNotifications(userId: string, limit = 50): Promise<import('./types').Notification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getRecipientCounts(topicIds: string[]): Promise<{ email: number; inApp: number }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('email_enabled, in_app_enabled')
    .in('topic_id', topicIds);

  if (error) throw error;

  const rows = data ?? [];
  return {
    email: rows.filter((r) => r.email_enabled).length,
    inApp: rows.filter((r) => r.in_app_enabled).length,
  };
}
