-- 014_ai_context.sql — AI Context system tables, RLS, and storage bucket
-- Spec: docs/superpowers/specs/2026-03-27-ai-context-design.md
--
-- This migration:
--   1. Creates ai_context_items, ai_context_summary, ai_context_geo_features tables
--   2. Creates indexes and triggers
--   3. Enables RLS with org-scoped policies
--   4. Creates the 'ai-context' storage bucket with RLS policies

-- ============================================================================
-- Step 1: Create tables
-- ============================================================================

-- AI Context Items — uploaded files, URLs, or text snippets providing org context
create table ai_context_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('file', 'url', 'text')),
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_path text,
  content_summary text,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'complete', 'error')),
  processing_error text,
  batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI Context Summary — rolled-up org profile and content map per org
create table ai_context_summary (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  org_profile text not null default '',
  content_map jsonb not null default '[]',
  last_rebuilt_at timestamptz not null default now(),
  version integer not null default 1,
  unique (org_id)
);

-- AI Context Geo Features — geographic features extracted from context items
create table ai_context_geo_features (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  source_item_id uuid not null references ai_context_items(id) on delete cascade,
  name text not null,
  description text,
  geometry_type text not null check (geometry_type in ('point', 'polygon', 'linestring')),
  geometry jsonb not null,
  properties jsonb not null default '{}',
  confidence float not null default 0.5,
  status text not null default 'pending' check (status in ('pending', 'approved', 'placed')),
  placed_item_id uuid references items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Step 2: Indexes
-- ============================================================================

create index idx_ai_context_items_org on ai_context_items(org_id);
create index idx_ai_context_items_batch on ai_context_items(batch_id) where batch_id is not null;
create index idx_ai_context_items_status on ai_context_items(processing_status);
create index idx_ai_context_geo_features_org on ai_context_geo_features(org_id);
create index idx_ai_context_geo_features_source on ai_context_geo_features(source_item_id);
create index idx_ai_context_geo_features_status on ai_context_geo_features(status);

-- ============================================================================
-- Step 3: Updated_at triggers
-- ============================================================================

create trigger ai_context_items_updated_at
  before update on ai_context_items
  for each row execute function update_updated_at();

-- ============================================================================
-- Step 4: Auto-populate org triggers (org-scoped, matches 009 pattern)
-- ============================================================================

create trigger ai_context_items_auto_org before insert on ai_context_items
  for each row execute function auto_populate_org_property('org_scoped');
create trigger ai_context_geo_features_auto_org before insert on ai_context_geo_features
  for each row execute function auto_populate_org_property('org_scoped');

-- ============================================================================
-- Step 5: RLS policies
-- ============================================================================

alter table ai_context_items enable row level security;
alter table ai_context_summary enable row level security;
alter table ai_context_geo_features enable row level security;

-- ai_context_items: org members can read/write, org admins can delete
create policy "ai_context_items_select" on ai_context_items for select
  to authenticated using (org_id in (select user_active_org_ids()));
create policy "ai_context_items_insert" on ai_context_items for insert
  to authenticated with check (org_id in (select user_active_org_ids()));
create policy "ai_context_items_update" on ai_context_items for update
  to authenticated using (org_id in (select user_active_org_ids()));
create policy "ai_context_items_delete" on ai_context_items for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- ai_context_summary: org members can read/write
create policy "ai_context_summary_select" on ai_context_summary for select
  to authenticated using (org_id in (select user_active_org_ids()));
create policy "ai_context_summary_insert" on ai_context_summary for insert
  to authenticated with check (org_id in (select user_active_org_ids()));
create policy "ai_context_summary_update" on ai_context_summary for update
  to authenticated using (org_id in (select user_active_org_ids()));

-- ai_context_geo_features: org members can read/write, org admins can delete
create policy "ai_context_geo_features_select" on ai_context_geo_features for select
  to authenticated using (org_id in (select user_active_org_ids()));
create policy "ai_context_geo_features_insert" on ai_context_geo_features for insert
  to authenticated with check (org_id in (select user_active_org_ids()));
create policy "ai_context_geo_features_update" on ai_context_geo_features for update
  to authenticated using (org_id in (select user_active_org_ids()));
create policy "ai_context_geo_features_delete" on ai_context_geo_features for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- ============================================================================
-- Step 6: Storage bucket
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('ai-context', 'ai-context', false);

-- ai-context bucket: org members can read files in their org folder
create policy "ai_context_storage_select" on storage.objects for select
  to authenticated using (
    bucket_id = 'ai-context'
    and (storage.foldername(name))[1] in (select user_active_org_ids()::text)
  );

-- ai-context bucket: org members can upload files into their org folder
create policy "ai_context_storage_insert" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'ai-context'
    and (storage.foldername(name))[1] in (select user_active_org_ids()::text)
  );

-- ai-context bucket: org admins can delete files
create policy "ai_context_storage_delete" on storage.objects for delete
  to authenticated using (
    bucket_id = 'ai-context'
    and (storage.foldername(name))[1] in (select user_org_admin_org_ids()::text)
  );
