-- =============================================================
-- 026_data_vault.sql — Data Vault tables, buckets, RLS, triggers
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Storage Buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('vault-public', 'vault-public', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('vault-private', 'vault-private', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table vault_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null check (storage_bucket in ('vault-public', 'vault-private')),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0,
  category text not null check (category in ('photo', 'document', 'branding', 'geospatial')),
  visibility text not null check (visibility in ('public', 'private')),
  is_ai_context boolean not null default false,
  ai_priority integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vault_items_org on vault_items(org_id);
create index idx_vault_items_category on vault_items(org_id, category);
create index idx_vault_items_ai on vault_items(org_id, is_ai_context) where is_ai_context = true;

create table vault_item_property_exclusions (
  vault_item_id uuid not null references vault_items(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vault_item_id, property_id)
);

create table vault_quotas (
  org_id uuid not null references orgs(id) on delete cascade unique,
  max_storage_bytes bigint not null default 104857600,
  current_storage_bytes bigint not null default 0,
  primary key (org_id)
);

-- Seed a quota row for every existing org
insert into vault_quotas (org_id)
select id from orgs
on conflict do nothing;

-- Auto-create quota row when a new org is created
create or replace function create_vault_quota_for_org()
returns trigger as $$
begin
  insert into vault_quotas (org_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql;

create trigger trg_create_vault_quota
after insert on orgs
for each row execute function create_vault_quota_for_org();

-- ---------------------------------------------------------------------------
-- 3. Quota Tracking Triggers
-- ---------------------------------------------------------------------------

create or replace function update_vault_quota_on_insert()
returns trigger as $$
begin
  update vault_quotas
  set current_storage_bytes = current_storage_bytes + new.file_size
  where org_id = new.org_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_vault_quota_insert
after insert on vault_items
for each row execute function update_vault_quota_on_insert();

create or replace function update_vault_quota_on_delete()
returns trigger as $$
begin
  update vault_quotas
  set current_storage_bytes = greatest(0, current_storage_bytes - old.file_size)
  where org_id = old.org_id;
  return old;
end;
$$ language plpgsql;

create trigger trg_vault_quota_delete
after delete on vault_items
for each row execute function update_vault_quota_on_delete();

-- ---------------------------------------------------------------------------
-- 4. RLS Policies — vault_items
-- ---------------------------------------------------------------------------

alter table vault_items enable row level security;

create policy vault_items_select on vault_items
  for select using (org_id in (select unnest(user_active_org_ids())));

create policy vault_items_insert on vault_items
  for insert with check (org_id in (select unnest(user_active_org_ids())));

create policy vault_items_update on vault_items
  for update using (org_id in (select unnest(user_org_admin_org_ids())));

create policy vault_items_delete on vault_items
  for delete using (org_id in (select unnest(user_org_admin_org_ids())));

-- ---------------------------------------------------------------------------
-- 5. RLS Policies — vault_item_property_exclusions
-- ---------------------------------------------------------------------------

alter table vault_item_property_exclusions enable row level security;

create policy vault_excl_select on vault_item_property_exclusions
  for select using (
    vault_item_id in (select id from vault_items where org_id in (select unnest(user_active_org_ids())))
  );

create policy vault_excl_insert on vault_item_property_exclusions
  for insert with check (
    vault_item_id in (select id from vault_items where org_id in (select unnest(user_org_admin_org_ids())))
  );

create policy vault_excl_delete on vault_item_property_exclusions
  for delete using (
    vault_item_id in (select id from vault_items where org_id in (select unnest(user_org_admin_org_ids())))
  );

-- ---------------------------------------------------------------------------
-- 6. RLS Policies — vault_quotas
-- ---------------------------------------------------------------------------

alter table vault_quotas enable row level security;

create policy vault_quotas_select on vault_quotas
  for select using (org_id in (select unnest(user_active_org_ids())));

-- ---------------------------------------------------------------------------
-- 7. Storage Bucket RLS Policies
-- ---------------------------------------------------------------------------

create policy vault_public_read on storage.objects
  for select using (bucket_id = 'vault-public');

create policy vault_public_insert on storage.objects
  for insert with check (
    bucket_id = 'vault-public'
    and (storage.foldername(name))[1] in (
      select id::text from orgs where id in (select unnest(user_active_org_ids()))
    )
  );

create policy vault_public_delete on storage.objects
  for delete using (
    bucket_id = 'vault-public'
    and (storage.foldername(name))[1] in (
      select id::text from orgs where id in (select unnest(user_org_admin_org_ids()))
    )
  );

create policy vault_private_select on storage.objects
  for select using (
    bucket_id = 'vault-private'
    and (storage.foldername(name))[1] in (
      select id::text from orgs where id in (select unnest(user_active_org_ids()))
    )
  );

create policy vault_private_insert on storage.objects
  for insert with check (
    bucket_id = 'vault-private'
    and (storage.foldername(name))[1] in (
      select id::text from orgs where id in (select unnest(user_active_org_ids()))
    )
  );

create policy vault_private_delete on storage.objects
  for delete using (
    bucket_id = 'vault-private'
    and (storage.foldername(name))[1] in (
      select id::text from orgs where id in (select unnest(user_org_admin_org_ids()))
    )
  );
