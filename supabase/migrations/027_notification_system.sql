-- =============================================================
-- 027_notification_system.sql — Tasks, notifications, preferences
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions (pg_cron and pg_net for scheduled processing)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Tasks table
-- ---------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  title text not null,
  description text,
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_org_status_due on tasks(org_id, status, due_date);
create index idx_tasks_assigned on tasks(assigned_to) where assigned_to is not null;

alter table tasks enable row level security;

create policy tasks_select on tasks
  for select to authenticated
  using (org_id in (select user_active_org_ids()));

create policy tasks_insert on tasks
  for insert to authenticated
  with check (org_id in (select user_active_org_ids()));

create policy tasks_update on tasks
  for update to authenticated
  using (org_id in (select user_active_org_ids()));

create policy tasks_delete on tasks
  for delete to authenticated
  using (org_id in (select user_active_org_ids()));

-- Auto-update updated_at
create or replace function update_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tasks_updated_at
before update on tasks
for each row execute function update_tasks_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Task watchers
-- ---------------------------------------------------------------------------

create table task_watchers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  constraint task_watchers_one_target check (
    (user_id is not null and role_id is null) or
    (user_id is null and role_id is not null)
  )
);

create index idx_task_watchers_task on task_watchers(task_id);

alter table task_watchers enable row level security;

create policy task_watchers_select on task_watchers
  for select to authenticated
  using (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

create policy task_watchers_insert on task_watchers
  for insert to authenticated
  with check (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

create policy task_watchers_delete on task_watchers
  for delete to authenticated
  using (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

-- ---------------------------------------------------------------------------
-- 4. Task reminders
-- ---------------------------------------------------------------------------

create table task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  remind_before interval not null,
  sent_at timestamptz,
  constraint task_reminders_unique_interval unique (task_id, remind_before)
);

create index idx_task_reminders_pending on task_reminders(task_id) where sent_at is null;

alter table task_reminders enable row level security;

create policy task_reminders_select on task_reminders
  for select to authenticated
  using (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

create policy task_reminders_insert on task_reminders
  for insert to authenticated
  with check (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

create policy task_reminders_delete on task_reminders
  for delete to authenticated
  using (task_id in (select id from tasks where org_id in (select user_active_org_ids())));

-- ---------------------------------------------------------------------------
-- 5. Notifications table
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  reference_type text not null,
  reference_id uuid not null,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_inapp on notifications(user_id, created_at desc)
  where channel = 'in_app';
create index idx_notifications_pending on notifications(status, channel)
  where status = 'pending' and channel != 'in_app';
create index idx_notifications_unread on notifications(user_id, read_at)
  where channel = 'in_app' and read_at is null;

alter table notifications enable row level security;

-- Users can read their own notifications
create policy notifications_select on notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
create policy notifications_update on notifications
  for update to authenticated
  using (user_id = auth.uid());

-- Service role inserts (no RLS insert policy for authenticated — only server-side)

-- ---------------------------------------------------------------------------
-- 6. User notification preferences
-- ---------------------------------------------------------------------------

create table user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  notification_type text not null,
  enabled boolean not null default true,
  constraint unp_unique unique (user_id, org_id, channel, notification_type)
);

alter table user_notification_preferences enable row level security;

create policy unp_select on user_notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy unp_insert on user_notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy unp_update on user_notification_preferences
  for update to authenticated
  using (user_id = auth.uid());

create policy unp_delete on user_notification_preferences
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Add phone column to users table
-- ---------------------------------------------------------------------------

alter table users add column if not exists phone text;
