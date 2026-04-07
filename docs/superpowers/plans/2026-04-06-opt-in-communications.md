# Opt-In Communications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow public visitors to opt in to org/property communications via email + in-app notifications, with full admin controls for topic management and sending.

**Architecture:** New `communication_topics`, `user_subscriptions`, `notifications`, and `notification_sends` tables with RLS. Resend for email delivery with React Email templates. Shared `SubscribeForm` component used by both a contextual bottom-sheet prompt and a Puck site-builder block. NotificationBell added to AuthActions for logged-in header awareness.

**Tech Stack:** Next.js 14 (App Router), Supabase PostgreSQL with RLS, Resend + React Email, Tailwind CSS, Puck editor

---

## File Structure

```
src/
  lib/
    communications/
      types.ts                     # TS types for all communications tables
      actions.ts                   # Server actions: topic CRUD, subscribe, send, unsubscribe
      queries.ts                   # Query helpers: getTopics, getSubscriptions, getUnreadCount
    email/
      resend.ts                    # Resend client wrapper
      templates/
        NotificationEmail.tsx      # React Email notification template
  components/
    communications/
      NotificationBell.tsx         # Bell icon with unread badge (client component)
      SubscribeForm.tsx            # Shared topic selection + auth form
      SubscribePrompt.tsx          # Contextual bottom-sheet / slide-in prompt
  lib/puck/
    components/
      content/
        SubscribeBlock.tsx         # Puck site builder subscribe component
  app/
    account/
      notifications/
        page.tsx                   # User notification settings (replace existing stub)
    org/
      [slug]/
        settings/
          communications/
            page.tsx               # Admin topic management page
        notifications/
          page.tsx                 # Admin send notification form
    api/
      unsubscribe/
        route.ts                   # Token-based unsubscribe endpoint (no login required)
supabase/
  migrations/
    040_communications.sql         # New tables, RLS, column additions
```

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/040_communications.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================
-- 040_communications.sql — Communication topics, subscriptions,
--                          notifications, and delivery tracking
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Alter existing tables
-- ---------------------------------------------------------------------------

alter table orgs add column communications_enabled boolean not null default false;
alter table properties add column communications_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------------

create table communication_topics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_comm_topics_org on communication_topics(org_id);
create index idx_comm_topics_property on communication_topics(property_id) where property_id is not null;

create table user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references communication_topics(id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, topic_id)
);

create index idx_user_subs_user on user_subscriptions(user_id);
create index idx_user_subs_topic on user_subscriptions(topic_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  topic_id uuid references communication_topics(id) on delete set null,
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id);
create index idx_notifications_unread on notifications(user_id, is_read) where is_read = false;

create table notification_sends (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references communication_topics(id) on delete cascade,
  channel text not null check (channel in ('email', 'in_app')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text
);

create index idx_notif_sends_notification on notification_sends(notification_id) where notification_id is not null;
create index idx_notif_sends_user on notification_sends(user_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — communication_topics
-- ---------------------------------------------------------------------------

alter table communication_topics enable row level security;

-- Anyone can read active topics for their resolved org
create policy comm_topics_select on communication_topics
  for select using (is_active = true);

-- Org admins can read all topics (including inactive) for their org
create policy comm_topics_select_admin on communication_topics
  for select using (org_id in (select user_org_admin_org_ids()));

-- Org admins can insert
create policy comm_topics_insert on communication_topics
  for insert with check (org_id in (select user_org_admin_org_ids()));

-- Org admins can update
create policy comm_topics_update on communication_topics
  for update using (org_id in (select user_org_admin_org_ids()));

-- Org admins can delete
create policy comm_topics_delete on communication_topics
  for delete using (org_id in (select user_org_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- 4. RLS — user_subscriptions
-- ---------------------------------------------------------------------------

alter table user_subscriptions enable row level security;

-- Users can read their own subscriptions
create policy user_subs_select on user_subscriptions
  for select using (user_id = auth.uid());

-- Users can insert their own subscriptions
create policy user_subs_insert on user_subscriptions
  for insert with check (user_id = auth.uid());

-- Users can update their own subscriptions
create policy user_subs_update on user_subscriptions
  for update using (user_id = auth.uid());

-- Users can delete their own subscriptions
create policy user_subs_delete on user_subscriptions
  for delete using (user_id = auth.uid());

-- Org admins can read subscriptions for topics in their org (for recipient counts)
create policy user_subs_select_admin on user_subscriptions
  for select using (
    topic_id in (
      select id from communication_topics
      where org_id in (select user_org_admin_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS — notifications
-- ---------------------------------------------------------------------------

alter table notifications enable row level security;

-- Users can read their own notifications
create policy notifications_select on notifications
  for select using (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
create policy notifications_update on notifications
  for update using (user_id = auth.uid());

-- Org admins can insert notifications for users in their org
create policy notifications_insert on notifications
  for insert with check (org_id in (select user_org_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- 6. RLS — notification_sends
-- ---------------------------------------------------------------------------

alter table notification_sends enable row level security;

-- Org admins can read sends for topics in their org
create policy notif_sends_select on notification_sends
  for select using (
    topic_id in (
      select id from communication_topics
      where org_id in (select user_org_admin_org_ids())
    )
  );

-- Org admins can insert sends
create policy notif_sends_insert on notification_sends
  for insert with check (
    topic_id in (
      select id from communication_topics
      where org_id in (select user_org_admin_org_ids())
    )
  );

-- Org admins can update sends (status changes)
create policy notif_sends_update on notification_sends
  for update using (
    topic_id in (
      select id from communication_topics
      where org_id in (select user_org_admin_org_ids())
    )
  );
```

- [ ] **Step 2: Verify migration file syntax**

Run: `cd /Users/patrick/birdhousemapper-218-communications && cat supabase/migrations/040_communications.sql | head -5`
Expected: First 5 lines of the migration visible without syntax errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add supabase/migrations/040_communications.sql
git commit -m "feat(db): add communications tables, RLS policies, and org/property columns (#218)"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/lib/communications/types.ts`
- Modify: `src/lib/types.ts` (add new table types to Database interface, update Org and Property interfaces)

- [ ] **Step 1: Create communications types file**

```typescript
// src/lib/communications/types.ts

export interface CommunicationTopic {
  id: string;
  org_id: string;
  property_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  topic_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  property_id: string | null;
  topic_id: string | null;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationChannel = 'email' | 'in_app';
export type NotificationSendStatus = 'pending' | 'sent' | 'failed';

export interface NotificationSend {
  id: string;
  notification_id: string | null;
  user_id: string;
  topic_id: string;
  channel: NotificationChannel;
  status: NotificationSendStatus;
  sent_at: string | null;
  error_message: string | null;
}

/** Topic with subscriber count — used in admin topic list */
export interface TopicWithCount extends CommunicationTopic {
  subscriber_count: number;
}

/** Subscription with topic details — used in user notification settings */
export interface SubscriptionWithTopic extends UserSubscription {
  topic: CommunicationTopic;
}
```

- [ ] **Step 2: Update Org interface in types.ts**

Add `communications_enabled` field to the `Org` interface in `src/lib/types.ts`, after the `map_display_config` field:

```typescript
// In the Org interface, add:
  communications_enabled: boolean;
```

- [ ] **Step 3: Update Property interface in types.ts**

Add `communications_enabled` field to the `Property` interface in `src/lib/types.ts`, after the `map_display_config` field:

```typescript
// In the Property interface, add:
  communications_enabled: boolean;
```

- [ ] **Step 4: Add new tables to Database interface in types.ts**

Add entries for the four new tables in the `Database['public']['Tables']` object in `src/lib/types.ts`. Import the types from `@/lib/communications/types`:

```typescript
// At the top of types.ts, add:
import type { CommunicationTopic, UserSubscription, Notification as AppNotification, NotificationSend } from '@/lib/communications/types';

// Inside Database > public > Tables, add:
      communication_topics: {
        Row: CommunicationTopic;
        Insert: Omit<CommunicationTopic, 'id' | 'created_at'>;
        Update: Partial<Omit<CommunicationTopic, 'id' | 'created_at'>>;
        Relationships: [];
      };
      user_subscriptions: {
        Row: UserSubscription;
        Insert: Omit<UserSubscription, 'id' | 'created_at'>;
        Update: Partial<Omit<UserSubscription, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: Omit<AppNotification, 'id' | 'created_at'>;
        Update: Partial<Omit<AppNotification, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notification_sends: {
        Row: NotificationSend;
        Insert: Omit<NotificationSend, 'id'>;
        Update: Partial<Omit<NotificationSend, 'id'>>;
        Relationships: [];
      };
```

- [ ] **Step 5: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/communications/types.ts src/lib/types.ts
git commit -m "feat: add TypeScript types for communications tables (#218)"
```

---

### Task 3: Communications Query Helpers

**Files:**
- Create: `src/lib/communications/queries.ts`

- [ ] **Step 1: Create query helpers file**

```typescript
// src/lib/communications/queries.ts
import { createClient } from '@/lib/supabase/server';
import type { CommunicationTopic, TopicWithCount, SubscriptionWithTopic } from './types';

/**
 * Get active topics for a given org, optionally filtered by property.
 * Returns org-wide topics (property_id IS NULL) plus property-specific topics.
 */
export async function getActiveTopics(orgId: string, propertyId?: string): Promise<CommunicationTopic[]> {
  const supabase = createClient();
  let query = supabase
    .from('communication_topics')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (propertyId) {
    // Org-wide (null property_id) + property-specific
    query = query.or(`property_id.is.null,property_id.eq.${propertyId}`);
  } else {
    query = query.is('property_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get all topics for an org (admin view), with subscriber counts.
 */
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

/**
 * Get a user's subscriptions with topic details, grouped by org.
 */
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

/**
 * Get unread notification count for a user.
 */
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

/**
 * Get notifications for a user, most recent first.
 */
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

/**
 * Get recipient counts for given topic IDs, split by channel preference.
 */
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
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/communications/queries.ts
git commit -m "feat: add communications query helpers (#218)"
```

---

### Task 4: Communications Server Actions

**Files:**
- Create: `src/lib/communications/actions.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
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
    status: 'pending' | 'sent';
    sent_at: string;
  }> = [];

  const now = new Date().toISOString();

  // Create in-app notifications
  if (input.channels.includes('in_app')) {
    for (const [userId, prefs] of userMap) {
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

    for (const [userId, prefs] of userMap) {
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
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: Type errors for the `sendNotificationEmail` import (not yet created) — that's expected at this point. All other types should resolve.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/communications/actions.ts
git commit -m "feat: add communications server actions (#218)"
```

---

### Task 5: Resend Email Infrastructure

**Files:**
- Create: `src/lib/email/resend.ts`
- Create: `src/lib/email/templates/NotificationEmail.tsx`

- [ ] **Step 1: Install dependencies**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm install resend @react-email/components`

- [ ] **Step 2: Create Resend client wrapper**

```typescript
// src/lib/email/resend.ts
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { renderNotificationEmail } from './templates/NotificationEmail';
import { sign } from './unsubscribe-token';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'notifications@fieldmapper.com';

export async function sendNotificationEmail(input: {
  userId: string;
  orgId: string;
  topicId: string;
  title: string;
  body: string;
  link: string | null;
}): Promise<void> {
  const supabase = createServiceClient();

  // Get user email
  const { data: authUser } = await supabase.auth.admin.getUserById(input.userId);
  if (!authUser?.user?.email) throw new Error('User email not found');

  // Get org details for branding
  const { data: org } = await supabase
    .from('orgs')
    .select('name, logo_url, theme')
    .eq('id', input.orgId)
    .single();

  const unsubscribeToken = sign({ userId: input.userId, topicId: input.topicId });
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?token=${unsubscribeToken}`;

  const html = renderNotificationEmail({
    orgName: org?.name ?? 'FieldMapper',
    orgLogoUrl: org?.logo_url ?? null,
    title: input.title,
    body: input.body,
    ctaUrl: input.link,
    unsubscribeUrl,
  });

  await resend.emails.send({
    from: `${org?.name ?? 'FieldMapper'} <${FROM_ADDRESS}>`,
    to: authUser.user.email,
    subject: input.title,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
```

- [ ] **Step 3: Create unsubscribe token utility**

```typescript
// src/lib/email/unsubscribe-token.ts
import { createHmac } from 'crypto';

const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fallback-secret';

interface UnsubscribePayload {
  userId: string;
  topicId: string;
}

export function sign(payload: UnsubscribePayload): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verify(token: string): UnsubscribePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', SECRET).update(encoded).digest('base64url');

  if (sig !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!data.userId || !data.topicId) return null;
    return data as UnsubscribePayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create React Email template**

```tsx
// src/lib/email/templates/NotificationEmail.tsx

interface NotificationEmailProps {
  orgName: string;
  orgLogoUrl: string | null;
  title: string;
  body: string;
  ctaUrl: string | null;
  unsubscribeUrl: string;
}

export function renderNotificationEmail(props: NotificationEmailProps): string {
  const { orgName, orgLogoUrl, title, body, ctaUrl, unsubscribeUrl } = props;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1a3a1a;padding:20px 24px;text-align:center;">
              ${orgLogoUrl
                ? `<img src="${escapeHtml(orgLogoUrl)}" alt="${escapeHtml(orgName)}" height="40" style="height:40px;max-width:200px;" />`
                : `<span style="color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(orgName)}</span>`
              }
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444444;">${escapeHtml(body)}</p>
              ${ctaUrl
                ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 24px;background:#2d6a2d;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Learn More</a>`
                : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #eeeeee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999999;">
                You received this because you subscribed to updates from ${escapeHtml(orgName)}.
                <br />
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#999999;text-decoration:underline;">Unsubscribe</a>
                &nbsp;|&nbsp;
                <a href="${escapeHtml(unsubscribeUrl)}&all=true" style="color:#999999;text-decoration:underline;">Unsubscribe from all</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 5: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/email/resend.ts src/lib/email/unsubscribe-token.ts src/lib/email/templates/NotificationEmail.tsx
git commit -m "feat: add Resend email infrastructure and notification template (#218)"
```

---

### Task 6: Unsubscribe API Route

**Files:**
- Create: `src/app/api/unsubscribe/route.ts`

- [ ] **Step 1: Create the unsubscribe route**

```typescript
// src/app/api/unsubscribe/route.ts
import { NextResponse } from 'next/server';
import { verify } from '@/lib/email/unsubscribe-token';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const unsubAll = url.searchParams.get('all') === 'true';

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const payload = verify(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (unsubAll) {
    // Disable email for all subscriptions
    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false })
      .eq('user_id', payload.userId);
  } else {
    // Disable email for this specific topic
    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false })
      .eq('user_id', payload.userId)
      .eq('topic_id', payload.topicId);
  }

  // Return a simple HTML confirmation page
  const html = `<!DOCTYPE html>
<html><head><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
  <h1 style="font-size:24px;color:#1a1a1a;">You've been unsubscribed</h1>
  <p style="color:#666;">
    ${unsubAll
      ? 'You will no longer receive email notifications.'
      : 'You will no longer receive email notifications for this topic.'
    }
  </p>
  <p style="color:#999;font-size:14px;">You can manage your preferences anytime from your account settings.</p>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Support RFC 8058 List-Unsubscribe-Post
export async function POST(request: Request) {
  return GET(request);
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/app/api/unsubscribe/route.ts
git commit -m "feat: add token-based unsubscribe endpoint (#218)"
```

---

### Task 7: NotificationBell Component

**Files:**
- Create: `src/components/communications/NotificationBell.tsx`
- Modify: `src/lib/puck/components/chrome/AuthActions.tsx`

- [ ] **Step 1: Create NotificationBell component**

```tsx
// src/components/communications/NotificationBell.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface NotificationBellProps {
  linkColor?: string;
}

export function NotificationBell({ linkColor }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setUnreadCount(count ?? 0);
    }

    fetchCount();

    // Re-fetch on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchCount();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Link
      href="/account/notifications"
      className="relative p-1.5 rounded-lg hover:bg-black/10 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      style={linkColor ? { color: linkColor } : undefined}
    >
      <BellIcon className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
```

- [ ] **Step 2: Add NotificationBell to AuthActions**

Modify `src/lib/puck/components/chrome/AuthActions.tsx` to include the bell. Replace the return JSX:

```tsx
// src/lib/puck/components/chrome/AuthActions.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AvatarMenu } from '@/components/layout/AvatarMenu';
import { NotificationBell } from '@/components/communications/NotificationBell';

interface AuthActionsProps {
  linkColor?: string;
}

export function AuthActions({ linkColor }: AuthActionsProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Check current session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });

    // Stay in sync with auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!userEmail) return null;

  return (
    <div className="flex items-center gap-2">
      <NotificationBell linkColor={linkColor} />
      <Link
        href="/org"
        className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
        aria-label="Admin settings"
        style={linkColor ? { color: linkColor } : undefined}
      >
        <GearIcon className="w-5 h-5" />
      </Link>
      <AvatarMenu userEmail={userEmail} />
    </div>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/components/communications/NotificationBell.tsx src/lib/puck/components/chrome/AuthActions.tsx
git commit -m "feat: add NotificationBell to property site header (#218)"
```

---

### Task 8: Mobile Bottom Tab Bar — Bell + Account Tabs

**Files:**
- Modify: `src/components/layout/Navigation.tsx`

- [ ] **Step 1: Add bell and account tabs to mobile bottom bar for authenticated users**

In `src/components/layout/Navigation.tsx`, modify the mobile bottom tab bar section (the `<nav>` at line 167) to conditionally show notification bell and account tabs when authenticated. Replace the entire bottom tab bar `<nav>` block:

```tsx
      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sage-light z-30 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {publicLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive ? 'text-forest' : 'text-sage'
                }`}
              >
                <link.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
          {isAuthenticated && (
            <>
              <Link
                href="/account/notifications"
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  pathname === '/account/notifications' ? 'text-forest' : 'text-sage'
                }`}
              >
                <BellIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Alerts</span>
              </Link>
              <Link
                href="/account"
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  pathname === '/account' ? 'text-forest' : 'text-sage'
                }`}
              >
                <UserIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Account</span>
              </Link>
            </>
          )}
        </div>
      </nav>
```

- [ ] **Step 2: Add BellIcon and UserIcon to the icon functions at the bottom of Navigation.tsx**

Add after the existing `CloseIcon` function:

```tsx
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/components/layout/Navigation.tsx
git commit -m "feat: add bell and account tabs to mobile bottom bar for authenticated users (#218)"
```

---

### Task 9: SubscribeForm Component

**Files:**
- Create: `src/components/communications/SubscribeForm.tsx`

- [ ] **Step 1: Create the shared subscribe form component**

This component is used by both the contextual prompt and the Puck SubscribeBlock. It shows topic checkboxes and auth entry (email input + Google OAuth).

```tsx
// src/components/communications/SubscribeForm.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CommunicationTopic } from '@/lib/communications/types';

interface SubscribeFormProps {
  topics: CommunicationTopic[];
  heading?: string;
  description?: string;
  /** Called after successful subscription + auth */
  onSuccess?: () => void;
}

export function SubscribeForm({ topics, heading, description, onSuccess }: SubscribeFormProps) {
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    topics.filter((t) => t.is_active).map((t) => t.id)
  );
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTopicIds.length === 0) {
      setError('Please select at least one topic.');
      return;
    }
    setError('');
    setLoading(true);

    const supabase = createClient();

    // Store selections in sessionStorage for the callback to pick up
    sessionStorage.setItem('fm_subscribe_topics', JSON.stringify(selectedTopicIds));

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    if (selectedTopicIds.length === 0) {
      setError('Please select at least one topic.');
      return;
    }
    setError('');
    setGoogleLoading(true);

    // Store selections in sessionStorage for the callback to pick up
    sessionStorage.setItem('fm_subscribe_topics', JSON.stringify(selectedTopicIds));

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  if (magicLinkSent) {
    return (
      <div className="text-center py-4">
        <p className="text-forest-dark font-medium mb-2">Check your email!</p>
        <p className="text-sage text-sm">
          We sent a sign-in link to <strong>{email}</strong>. Click the link to complete your subscription.
        </p>
      </div>
    );
  }

  return (
    <div>
      {heading && (
        <h3 className="font-heading font-semibold text-forest-dark text-lg mb-1">{heading}</h3>
      )}
      {description && (
        <p className="text-sage text-sm mb-4">{description}</p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Topic checkboxes */}
      <div className="space-y-2 mb-4">
        {topics.map((topic) => (
          <label
            key={topic.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sage-light/30 hover:bg-sage-light/50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedTopicIds.includes(topic.id)}
              onChange={() => toggleTopic(topic.id)}
              className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
            />
            <div>
              <span className="text-sm font-medium text-forest-dark">{topic.name}</span>
              {topic.description && (
                <span className="text-xs text-sage block">{topic.description}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Email input */}
      <form onSubmit={handleEmailSubmit} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={loading || googleLoading}
          className="btn-primary whitespace-nowrap"
        >
          {loading ? 'Sending...' : 'Get Updates'}
        </button>
      </form>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading || googleLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-sage-light rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-sage-light/30 transition-colors disabled:opacity-50"
      >
        {googleLoading ? (
          <span className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        {googleLoading ? 'Redirecting...' : 'Continue with Google'}
      </button>

      <p className="text-[11px] text-sage text-center mt-3">
        Creates a free account to manage your preferences
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/components/communications/SubscribeForm.tsx
git commit -m "feat: add shared SubscribeForm component with topic selection and auth (#218)"
```

---

### Task 10: Auth Callback — Process Pending Subscriptions

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Add subscription processing to auth callback**

After `exchangeCodeForSession` succeeds and before the redirect logic, add code to save any pending topic subscriptions. The topics are passed via the `subscribe_topics` query parameter (set by SubscribeForm which puts them in sessionStorage — but since the callback is a server route, we need to pass via query param instead).

Update `src/components/communications/SubscribeForm.tsx` first — change both `emailRedirectTo` and `redirectTo` to include topics in the URL:

In `handleEmailSubmit`, change the `emailRedirectTo`:
```typescript
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}&subscribe_topics=${encodeURIComponent(JSON.stringify(selectedTopicIds))}`,
```

In `handleGoogleSignIn`, change the `redirectTo`:
```typescript
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}&subscribe_topics=${encodeURIComponent(JSON.stringify(selectedTopicIds))}`,
```

- [ ] **Step 2: Add subscription saving to the callback route**

In `src/app/api/auth/callback/route.ts`, after the `exchangeCodeForSession` success check (line 38: `if (!error) {`), add subscription processing before the existing `if (context === 'platform')` block:

```typescript
    if (!error) {
      // Process pending topic subscriptions from the subscribe flow
      const subscribeTopics = requestUrl.searchParams.get('subscribe_topics');
      if (subscribeTopics) {
        try {
          const topicIds: string[] = JSON.parse(subscribeTopics);
          if (Array.isArray(topicIds) && topicIds.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const rows = topicIds.map((topic_id) => ({
                user_id: user.id,
                topic_id,
                email_enabled: true,
                in_app_enabled: true,
              }));
              await supabase
                .from('user_subscriptions')
                .upsert(rows, { onConflict: 'user_id,topic_id' });

              // Set cookie to suppress the subscribe prompt
              cookieStore.set('fm_prompt_subscribed', '1', {
                maxAge: 60 * 60 * 24 * 365, // 1 year
                path: '/',
                sameSite: 'lax',
              });
            }
          }
        } catch {
          // Ignore parse errors — don't block the auth flow
        }
      }

      if (context === 'platform') {
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/app/api/auth/callback/route.ts src/components/communications/SubscribeForm.tsx
git commit -m "feat: save topic subscriptions in auth callback flow (#218)"
```

---

### Task 11: SubscribePrompt Component

**Files:**
- Create: `src/components/communications/SubscribePrompt.tsx`

- [ ] **Step 1: Create the contextual subscribe prompt**

```tsx
// src/components/communications/SubscribePrompt.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SubscribeForm } from './SubscribeForm';
import type { CommunicationTopic } from '@/lib/communications/types';

interface SubscribePromptProps {
  topics: CommunicationTopic[];
  siteName: string;
}

export function SubscribePrompt({ topics, siteName }: SubscribePromptProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const shouldSuppress = useCallback(() => {
    if (typeof document === 'undefined') return true;
    // Check suppression cookies
    if (document.cookie.includes('fm_prompt_dismissed')) return true;
    if (document.cookie.includes('fm_prompt_subscribed')) return true;
    return false;
  }, []);

  useEffect(() => {
    if (shouldSuppress()) return;
    if (topics.length === 0) return;

    // Check if user is authenticated — don't show to logged-in users
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) return;

      // Set up triggers: 30s timer OR scroll past fold
      let triggered = false;

      function trigger() {
        if (triggered) return;
        triggered = true;
        setVisible(true);
        window.removeEventListener('scroll', handleScroll);
        clearTimeout(timer);
      }

      const timer = setTimeout(trigger, 30_000);

      function handleScroll() {
        if (window.scrollY > window.innerHeight * 0.5) {
          trigger();
        }
      }

      window.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll);
      };
    });
  }, [shouldSuppress, topics.length]);

  function handleDismiss() {
    setDismissed(true);
    setVisible(false);
    // Set cookie to suppress for 30 days
    document.cookie = 'fm_prompt_dismissed=1; max-age=2592000; path=/; samesite=lax';
  }

  function handleSuccess() {
    setVisible(false);
    document.cookie = 'fm_prompt_subscribed=1; max-age=31536000; path=/; samesite=lax';
  }

  if (!visible || dismissed || topics.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 md:hidden"
        onClick={handleDismiss}
      />
      {/* Mobile: bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden animate-slide-up">
        <div className="bg-white rounded-t-2xl shadow-xl p-5 pb-8 safe-area-pb">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-1 bg-sage-light rounded-full mx-auto" />
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1 text-sage hover:text-forest-dark"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SubscribeForm
            topics={topics}
            heading={`Stay updated on ${siteName}`}
            description="Get notified about opportunities and updates."
            onSuccess={handleSuccess}
          />
        </div>
      </div>
      {/* Desktop: slide-in from bottom-right */}
      <div className="hidden md:block fixed bottom-6 right-6 z-50 w-96 animate-slide-up">
        <div className="bg-white rounded-xl shadow-xl border border-sage-light p-5 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 text-sage hover:text-forest-dark"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <SubscribeForm
            topics={topics}
            heading={`Stay updated on ${siteName}`}
            description="Get notified about opportunities and updates."
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the `animate-slide-up` keyframe to Tailwind config**

Check if the animation already exists. If not, add to `tailwind.config.ts` under `theme.extend.animation` and `theme.extend.keyframes`:

```typescript
// In tailwind.config.ts, theme.extend:
animation: {
  'slide-up': 'slide-up 0.3s ease-out',
},
keyframes: {
  'slide-up': {
    '0%': { transform: 'translateY(100%)', opacity: '0' },
    '100%': { transform: 'translateY(0)', opacity: '1' },
  },
},
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/components/communications/SubscribePrompt.tsx tailwind.config.ts
git commit -m "feat: add contextual SubscribePrompt with time/scroll triggers (#218)"
```

---

### Task 12: Wire SubscribePrompt Into Property Site Layout

**Files:**
- Modify: property site layout file (the layout that renders `Navigation`)

- [ ] **Step 1: Find and modify the property site layout**

The `SubscribePrompt` needs to be rendered in the property site layout. It needs topics fetched server-side and passed as props. Find the layout that wraps public property pages (likely `src/app/layout.tsx` or `src/app/p/[slug]/layout.tsx`) and add the prompt.

In the layout component, after existing content, add:

```tsx
import { getActiveTopics } from '@/lib/communications/queries';

// Inside the layout's server component, fetch topics:
const orgId = /* get from tenant context headers */;
const propertyId = /* get from tenant context headers */;

// Check if communications are enabled
const supabase = createClient();
const { data: org } = await supabase.from('orgs').select('communications_enabled').eq('id', orgId).single();
const { data: property } = propertyId
  ? await supabase.from('properties').select('communications_enabled').eq('id', propertyId).single()
  : { data: null };

const communicationsEnabled = org?.communications_enabled && (property?.communications_enabled ?? true);
const topics = communicationsEnabled ? await getActiveTopics(orgId, propertyId ?? undefined) : [];

// In the JSX, after Navigation:
{topics.length > 0 && (
  <SubscribePrompt topics={topics} siteName={config.siteName} />
)}
```

The exact modification depends on the layout structure. The implementer should find the appropriate layout file and integrate this server-side data fetching + client component rendering.

- [ ] **Step 2: Run type check and dev server**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add -A
git commit -m "feat: wire SubscribePrompt into property site layout (#218)"
```

---

### Task 13: Puck SubscribeBlock Component

**Files:**
- Create: `src/lib/puck/components/content/SubscribeBlock.tsx`
- Modify: `src/lib/puck/config.ts` (register new component)

- [ ] **Step 1: Create the Puck SubscribeBlock component**

```tsx
// src/lib/puck/components/content/SubscribeBlock.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SubscribeForm } from '@/components/communications/SubscribeForm';
import type { CommunicationTopic } from '@/lib/communications/types';
import { useConfig } from '@/lib/config/client';

export interface SubscribeBlockProps {
  heading: string;
  description: string;
  layout: 'compact' | 'expanded';
}

export function SubscribeBlock({ heading, description, layout }: SubscribeBlockProps) {
  const config = useConfig();
  const [topics, setTopics] = useState<CommunicationTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTopics() {
      const supabase = createClient();
      const { data } = await supabase
        .from('communication_topics')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setTopics(data ?? []);
      setLoading(false);
    }
    fetchTopics();
  }, []);

  if (loading) {
    return (
      <div className={`${layout === 'expanded' ? 'py-8 px-6' : 'py-4 px-4'}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-sage-light/50 rounded w-1/3" />
          <div className="h-4 bg-sage-light/50 rounded w-2/3" />
          <div className="h-10 bg-sage-light/50 rounded" />
        </div>
      </div>
    );
  }

  if (topics.length === 0) return null;

  return (
    <div className={`${layout === 'expanded' ? 'py-8 px-6' : 'py-4 px-4'}`}>
      <SubscribeForm
        topics={topics}
        heading={heading || `Get involved with ${config.siteName}`}
        description={description || 'Choose what you\'d like to hear about:'}
      />
    </div>
  );
}
```

- [ ] **Step 2: Register SubscribeBlock in Puck config**

In `src/lib/puck/config.ts`, add the SubscribeBlock component to the `pageConfig.components` object. Add the import at the top and the config entry:

```typescript
// Import at top of config.ts:
import { SubscribeBlock, type SubscribeBlockProps } from './components/content/SubscribeBlock';

// Add to the components object in pageConfig:
    SubscribeBlock: {
      label: 'Subscribe / Get Updates',
      defaultProps: {
        heading: 'Get Involved',
        description: "Choose what you'd like to hear about:",
        layout: 'expanded' as const,
      },
      fields: {
        heading: { type: 'text', label: 'Heading' },
        description: { type: 'textarea', label: 'Description' },
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Expanded', value: 'expanded' },
            { label: 'Compact', value: 'compact' },
          ],
        },
      },
      render: ({ heading, description, layout }: SubscribeBlockProps) => (
        <SubscribeBlock heading={heading} description={description} layout={layout} />
      ),
    },
```

Also add `SubscribeBlock` to the `PageComponents` type (at the top of config.ts where the component keys are listed).

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/puck/components/content/SubscribeBlock.tsx src/lib/puck/config.ts
git commit -m "feat: add Puck SubscribeBlock component for site builder (#218)"
```

---

### Task 14: User Notification Settings Page

**Files:**
- Modify: `src/app/account/notifications/page.tsx` (replace stub)

- [ ] **Step 1: Replace the notification settings stub**

```tsx
// src/app/account/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionWithTopic } from '@/lib/communications/types';
import type { Notification } from '@/lib/communications/types';

export default function NotificationsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithTopic[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'notifications' | 'settings'>('notifications');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [subsResult, notifsResult] = await Promise.all([
        supabase
          .from('user_subscriptions')
          .select('*, topic:communication_topics(*)')
          .eq('user_id', user.id),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setSubscriptions(
        (subsResult.data ?? []).map((row: any) => ({ ...row, topic: row.topic }))
      );
      setNotifications(notifsResult.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleSubscription(subId: string, field: 'email_enabled' | 'in_app_enabled', value: boolean) {
    const supabase = createClient();
    await supabase
      .from('user_subscriptions')
      .update({ [field]: value })
      .eq('id', subId);

    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, [field]: value } : s))
    );
  }

  async function handleUnsubscribeAll() {
    if (!confirm('Are you sure you want to unsubscribe from all notifications?')) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false, in_app_enabled: false })
      .eq('user_id', user.id);

    setSubscriptions((prev) =>
      prev.map((s) => ({ ...s, email_enabled: false, in_app_enabled: false }))
    );
  }

  async function markAsRead(notifId: string) {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
  }

  async function markAllRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sage-light/50 rounded w-1/3" />
          <div className="h-4 bg-sage-light/50 rounded w-full" />
          <div className="h-4 bg-sage-light/50 rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-sage-light/30 rounded-lg p-1">
        <button
          onClick={() => setTab('notifications')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'notifications' ? 'bg-white text-forest-dark shadow-sm' : 'text-sage hover:text-forest-dark'
          }`}
        >
          Notifications
          {notifications.filter((n) => !n.is_read).length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {notifications.filter((n) => !n.is_read).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'settings' ? 'bg-white text-forest-dark shadow-sm' : 'text-sage hover:text-forest-dark'
          }`}
        >
          Settings
        </button>
      </div>

      {tab === 'notifications' && (
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">Notifications</h2>
            {notifications.some((n) => !n.is_read) && (
              <button onClick={markAllRead} className="text-xs text-forest hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sage text-sm">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-sage-light">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 ${!notif.is_read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.is_read ? 'font-semibold text-forest-dark' : 'text-gray-700'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-sage mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-[10px] text-sage mt-1">
                        {new Date(notif.created_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="text-[10px] text-forest hover:underline whitespace-nowrap mt-1"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {notif.link && (
                    <a href={notif.link} className="text-xs text-forest hover:underline mt-1 inline-block">
                      View details &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="card">
          <div className="px-4 py-3 border-b border-sage-light">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">Subscription Settings</h2>
          </div>
          {subscriptions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sage text-sm">
              You haven&apos;t subscribed to any topics yet.
            </div>
          ) : (
            <>
              <div className="divide-y divide-sage-light">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-forest-dark">{sub.topic.name}</p>
                        {sub.topic.description && (
                          <p className="text-xs text-sage">{sub.topic.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={sub.email_enabled}
                          onChange={(e) => toggleSubscription(sub.id, 'email_enabled', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-sage text-forest focus:ring-forest"
                        />
                        Email
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={sub.in_app_enabled}
                          onChange={(e) => toggleSubscription(sub.id, 'in_app_enabled', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-sage text-forest focus:ring-forest"
                        />
                        In-app
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-sage-light">
                <button
                  onClick={handleUnsubscribeAll}
                  className="text-xs text-red-600 hover:underline"
                >
                  Unsubscribe from all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/app/account/notifications/page.tsx
git commit -m "feat: replace notification settings stub with full settings + feed page (#218)"
```

---

### Task 15: Admin — Topic Management Page

**Files:**
- Create: `src/app/org/[slug]/settings/communications/page.tsx`

- [ ] **Step 1: Create the topic management page**

```tsx
// src/app/org/[slug]/settings/communications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TopicWithCount } from '@/lib/communications/types';
import type { Property } from '@/lib/types';

export default function CommunicationsSettingsPage() {
  const [topics, setTopics] = useState<TopicWithCount[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTopic, setEditingTopic] = useState<TopicWithCount | null>(null);
  const [orgId, setOrgId] = useState<string>('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPropertyId, setFormPropertyId] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Get org_id from cookie/header
      const cookies = document.cookie.split(';').map((c) => c.trim());
      const orgIdCookie = cookies.find((c) => c.startsWith('x-org-id='));
      const currentOrgId = orgIdCookie?.split('=')[1] || '';
      setOrgId(currentOrgId);

      if (!currentOrgId) {
        setLoading(false);
        return;
      }

      const [topicsResult, propsResult] = await Promise.all([
        supabase
          .from('communication_topics')
          .select('*, user_subscriptions(count)')
          .eq('org_id', currentOrgId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('properties')
          .select('id, name, slug')
          .eq('org_id', currentOrgId)
          .eq('is_active', true)
          .order('name'),
      ]);

      setTopics(
        (topicsResult.data ?? []).map((t: any) => ({
          ...t,
          subscriber_count: t.user_subscriptions?.[0]?.count ?? 0,
        }))
      );
      setProperties(propsResult.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function openCreateForm() {
    setEditingTopic(null);
    setFormName('');
    setFormDescription('');
    setFormPropertyId('');
    setFormSortOrder(topics.length);
    setShowForm(true);
    setError('');
  }

  function openEditForm(topic: TopicWithCount) {
    setEditingTopic(topic);
    setFormName(topic.name);
    setFormDescription(topic.description ?? '');
    setFormPropertyId(topic.property_id ?? '');
    setFormSortOrder(topic.sort_order);
    setShowForm(true);
    setError('');
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');

    const supabase = createClient();

    if (editingTopic) {
      const { error: updateError } = await supabase
        .from('communication_topics')
        .update({
          name: formName.trim(),
          description: formDescription.trim() || null,
          property_id: formPropertyId || null,
          sort_order: formSortOrder,
        })
        .eq('id', editingTopic.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setTopics((prev) =>
        prev.map((t) =>
          t.id === editingTopic.id
            ? { ...t, name: formName.trim(), description: formDescription.trim() || null, property_id: formPropertyId || null, sort_order: formSortOrder }
            : t
        )
      );
    } else {
      const { data, error: insertError } = await supabase
        .from('communication_topics')
        .insert({
          org_id: orgId,
          property_id: formPropertyId || null,
          name: formName.trim(),
          description: formDescription.trim() || null,
          sort_order: formSortOrder,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setTopics((prev) => [...prev, { ...data, subscriber_count: 0 }]);
    }

    setShowForm(false);
    setSaving(false);
  }

  async function handleToggleActive(topic: TopicWithCount) {
    const supabase = createClient();
    const newActive = !topic.is_active;
    await supabase
      .from('communication_topics')
      .update({ is_active: newActive })
      .eq('id', topic.id);

    setTopics((prev) =>
      prev.map((t) => (t.id === topic.id ? { ...t, is_active: newActive } : t))
    );
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-4">
        <div className="h-6 bg-sage-light/50 rounded w-1/3" />
        <div className="h-4 bg-sage-light/50 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-forest-dark">Communication Topics</h2>
        <button onClick={openCreateForm} className="btn-primary text-sm">
          Add Topic
        </button>
      </div>

      {/* Topic list */}
      <div className="card divide-y divide-sage-light">
        {topics.length === 0 ? (
          <div className="px-4 py-8 text-center text-sage text-sm">
            No topics yet. Create one to start collecting subscribers.
          </div>
        ) : (
          topics.map((topic) => (
            <div key={topic.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${topic.is_active ? 'text-forest-dark' : 'text-sage line-through'}`}>
                    {topic.name}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sage-light text-sage">
                    {topic.property_id
                      ? properties.find((p) => p.id === topic.property_id)?.name ?? 'Property'
                      : 'All properties'}
                  </span>
                </div>
                {topic.description && (
                  <p className="text-xs text-sage mt-0.5">{topic.description}</p>
                )}
                <p className="text-[10px] text-sage mt-1">{topic.subscriber_count} subscriber{topic.subscriber_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(topic)}
                  className={`text-xs px-2 py-1 rounded ${topic.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {topic.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => openEditForm(topic)}
                  className="text-xs text-forest hover:underline"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading font-semibold text-forest-dark mb-4">
              {editingTopic ? 'Edit Topic' : 'New Topic'}
            </h3>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Volunteer Opportunities"
                />
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="input-field"
                  placeholder="Brief description shown to subscribers"
                />
              </div>
              <div>
                <label className="label">Scope</label>
                <select
                  value={formPropertyId}
                  onChange={(e) => setFormPropertyId(e.target.value)}
                  className="input-field"
                >
                  <option value="">All properties (org-wide)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Sort Order</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : editingTopic ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/app/org/\[slug\]/settings/communications/page.tsx
git commit -m "feat: add admin topic management page (#218)"
```

---

### Task 16: Admin — Send Notification Page

**Files:**
- Create: `src/app/org/[slug]/notifications/page.tsx`

- [ ] **Step 1: Create the send notification page**

```tsx
// src/app/org/[slug]/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CommunicationTopic } from '@/lib/communications/types';

export default function SendNotificationPage() {
  const [topics, setTopics] = useState<CommunicationTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');

  // Form state
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [channels, setChannels] = useState<Set<'email' | 'in_app'>>(new Set(['email', 'in_app']));
  const [recipientCount, setRecipientCount] = useState<{ email: number; inApp: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const cookies = document.cookie.split(';').map((c) => c.trim());
      const orgIdCookie = cookies.find((c) => c.startsWith('x-org-id='));
      const currentOrgId = orgIdCookie?.split('=')[1] || '';
      setOrgId(currentOrgId);

      if (!currentOrgId) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('communication_topics')
        .select('*')
        .eq('org_id', currentOrgId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setTopics(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Fetch recipient counts when topics change
  useEffect(() => {
    async function fetchCounts() {
      if (selectedTopicIds.length === 0) {
        setRecipientCount(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from('user_subscriptions')
        .select('email_enabled, in_app_enabled')
        .in('topic_id', selectedTopicIds);

      const rows = data ?? [];
      setRecipientCount({
        email: rows.filter((r) => r.email_enabled).length,
        inApp: rows.filter((r) => r.in_app_enabled).length,
      });
    }
    fetchCounts();
  }, [selectedTopicIds]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  }

  function toggleChannel(ch: 'email' | 'in_app') {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }

  async function handleSend() {
    if (selectedTopicIds.length === 0) return;
    if (!title.trim() || !body.trim()) return;
    if (channels.size === 0) return;

    if (!confirm(`Send this notification to ${recipientCount ? Math.max(recipientCount.email, recipientCount.inApp) : 0} subscribers?`)) return;

    setSending(true);
    setResult(null);

    const { sendNotification } = await import('@/lib/communications/actions');
    const res = await sendNotification({
      org_id: orgId,
      topic_ids: selectedTopicIds,
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      channels: Array.from(channels),
    });

    if ('error' in res) {
      setResult({ success: false, message: res.error });
    } else {
      setResult({
        success: true,
        message: `Sent! ${res.sent.email} emails, ${res.sent.inApp} in-app notifications.`,
      });
      setTitle('');
      setBody('');
      setLink('');
      setSelectedTopicIds([]);
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-4">
        <div className="h-6 bg-sage-light/50 rounded w-1/3" />
        <div className="h-4 bg-sage-light/50 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">Send Notification</h2>

      {result && (
        <div className={`rounded-lg px-3 py-2 text-sm ${result.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {result.message}
        </div>
      )}

      <div className="card p-4 space-y-4">
        {/* Topic selection */}
        <div>
          <label className="label">Topics</label>
          <div className="space-y-2 mt-1">
            {topics.length === 0 ? (
              <p className="text-sm text-sage">No active topics. Create topics in Communications Settings first.</p>
            ) : (
              topics.map((topic) => (
                <label key={topic.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sage-light/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTopicIds.includes(topic.id)}
                    onChange={() => toggleTopic(topic.id)}
                    className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
                  />
                  <span className="text-sm text-forest-dark">{topic.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Recipient preview */}
        {recipientCount && (
          <div className="text-sm text-sage bg-sage-light/20 rounded-lg px-3 py-2">
            This will reach <strong>{recipientCount.email}</strong> via email and <strong>{recipientCount.inApp}</strong> via in-app.
          </div>
        )}

        {/* Title */}
        <div>
          <label className="label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
            placeholder="Notification title"
          />
        </div>

        {/* Body */}
        <div>
          <label className="label">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input-field min-h-[100px]"
            placeholder="Write your notification message..."
          />
        </div>

        {/* Link */}
        <div>
          <label className="label">Link (optional)</label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input-field"
            placeholder="https://..."
          />
        </div>

        {/* Channel selection */}
        <div>
          <label className="label">Channels</label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channels.has('email')}
                onChange={() => toggleChannel('email')}
                className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channels.has('in_app')}
                onChange={() => toggleChannel('in_app')}
                className="w-4 h-4 rounded border-sage text-forest focus:ring-forest"
              />
              In-app
            </label>
          </div>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || selectedTopicIds.length === 0 || !title.trim() || !body.trim() || channels.size === 0}
          className="btn-primary w-full"
        >
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/app/org/\[slug\]/notifications/page.tsx
git commit -m "feat: add admin send notification page (#218)"
```

---

### Task 17: Add Admin Nav Links

**Files:**
- Modify: The org admin navigation/sidebar component (find the component that renders the org admin sidebar/nav with links to settings, members, etc.)

- [ ] **Step 1: Find the org admin navigation component**

Search for the component that renders the admin sidebar/nav. It's likely in `src/components/org/OrgShell.tsx` or similar. Add two new navigation links:

1. **Communications** → `/org/[slug]/settings/communications` — under the existing Settings section
2. **Send Notification** → `/org/[slug]/notifications` — as a new top-level admin action

The exact implementation depends on the navigation structure. Add the links following the existing patterns.

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add -A
git commit -m "feat: add communications and notifications links to admin nav (#218)"
```

---

### Task 18: Add SiteConfig Support for Communications Enabled

**Files:**
- Modify: `src/lib/config/types.ts` — add `communicationsEnabled` to SiteConfig
- Modify: `src/lib/config/server.ts` — populate the new field from org + property data

- [ ] **Step 1: Add communicationsEnabled to SiteConfig interface**

In `src/lib/config/types.ts`, add to the `SiteConfig` interface:

```typescript
  communicationsEnabled: boolean;
```

- [ ] **Step 2: Populate in buildSiteConfig**

In `src/lib/config/server.ts` (or wherever `buildSiteConfig` is defined), add:

```typescript
  communicationsEnabled: (org.communications_enabled ?? false) && (property?.communications_enabled ?? true),
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add src/lib/config/types.ts src/lib/config/server.ts
git commit -m "feat: add communicationsEnabled to SiteConfig (#218)"
```

---

### Task 19: Type Check and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run type-check`
Expected: No type errors.

- [ ] **Step 2: Run tests**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run test`
Expected: All existing tests pass. No new tests broken.

- [ ] **Step 3: Run build**

Run: `cd /Users/patrick/birdhousemapper-218-communications && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Fix any issues found**

If any type errors, test failures, or build errors occur, fix them and commit:

```bash
cd /Users/patrick/birdhousemapper-218-communications
git add -A
git commit -m "fix: resolve build/type issues for communications feature (#218)"
```
