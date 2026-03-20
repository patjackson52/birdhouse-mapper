-- ======================
-- Invites table
-- ======================

create table invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  created_by uuid not null references profiles(id),
  display_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  convertible boolean not null default false,
  session_expires_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_by uuid references profiles(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for token lookup (claim flow)
create index idx_invites_token on invites (token);

-- Index for admin listing
create index idx_invites_created_by on invites (created_by, created_at desc);

-- Prevent double-claims at the database level
create unique index idx_invites_claimed_by on invites (claimed_by) where claimed_by is not null;

alter table invites enable row level security;

-- RLS: Admin only for all operations
create policy "Admins can view invites"
  on invites for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can create invites"
  on invites for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update invites"
  on invites for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete invites"
  on invites for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Allow temp users to read their own invite (needed by middleware for convertible check)
create policy "Users can view their own claimed invite"
  on invites for select
  using (claimed_by = auth.uid());

-- ======================
-- Profiles: add temp account columns
-- ======================

alter table profiles add column is_temporary boolean not null default false;
alter table profiles add column session_expires_at timestamptz;
alter table profiles add column invite_id uuid references invites(id);
alter table profiles add column deleted_at timestamptz;

-- Index for cleanup cron
create index idx_profiles_temp_cleanup
  on profiles (is_temporary, session_expires_at)
  where is_temporary = true and deleted_at is null;

-- ======================
-- Update handle_new_user trigger to skip anonymous users
-- ======================

create or replace function handle_new_user()
returns trigger as $$
begin
  -- Skip profile creation for anonymous users;
  -- the claim server action creates the profile with temp fields instead.
  if new.is_anonymous = true then
    return new;
  end if;

  insert into profiles (id, display_name, role)
  values (new.id, new.raw_user_meta_data->>'display_name', 'editor');
  return new;
end;
$$ language plpgsql security definer;

-- ======================
-- Drop CASCADE FK on profiles.id -> auth.users
-- ======================

alter table profiles drop constraint profiles_id_fkey;
-- FK intentionally dropped (not re-added). Cleanup cron soft-deletes
-- the profile (sets deleted_at) then deletes the auth user. Without a FK,
-- PostgreSQL won't block the auth user deletion.
