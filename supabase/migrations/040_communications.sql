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
