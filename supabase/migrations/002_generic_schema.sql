-- 002_generic_schema.sql — Migrate to generic Field Mapper schema
-- Run this migration AFTER 001_initial_schema.sql

-- ======================
-- New Tables
-- ======================

-- Site Configuration (key-value store)
create table site_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Item Types (what kinds of things are tracked)
create table item_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '📍',
  color text not null default '#5D7F3A',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Custom Fields (per-type custom fields)
create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  item_type_id uuid not null references item_types(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'dropdown', 'date')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

-- Update Types (configurable update/log types)
create table update_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '📝',
  is_global boolean not null default false,
  item_type_id uuid references item_types(id) on delete cascade,
  sort_order int not null default 0,
  constraint update_types_global_check check (
    (is_global = true and item_type_id is null) or
    (is_global = false and item_type_id is not null)
  )
);

-- ======================
-- Rename existing tables
-- ======================

-- Rename birdhouses → items
alter table birdhouses rename to items;

-- Add new columns to items
alter table items add column item_type_id uuid references item_types(id);
alter table items add column custom_field_values jsonb default '{}'::jsonb;

-- Rename birdhouse_updates → item_updates
alter table birdhouse_updates rename to item_updates;

-- Rename the FK column on item_updates
alter table item_updates rename column birdhouse_id to item_id;

-- Add update_type_id to item_updates (will be populated after update_types are seeded)
alter table item_updates add column update_type_id uuid references update_types(id);

-- Rename photos.birdhouse_id → photos.item_id
alter table photos rename column birdhouse_id to item_id;

-- Rename foreign key constraint references
alter index idx_birdhouses_status rename to idx_items_status;
alter index idx_updates_birdhouse rename to idx_updates_item;
alter index idx_photos_birdhouse rename to idx_photos_item;

-- Add indexes for new columns
create index idx_items_type on items(item_type_id);
create index idx_custom_fields_type on custom_fields(item_type_id);
create index idx_update_types_item_type on update_types(item_type_id);

-- Updated_at trigger on items (rename from birdhouses trigger)
drop trigger if exists birdhouses_updated_at on items;
create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();

-- Updated_at trigger on site_config
create trigger site_config_updated_at
  before update on site_config
  for each row execute function update_updated_at();

-- ======================
-- Migrate existing data to new schema
-- ======================

-- Create default "Bird Box" item type
insert into item_types (id, name, icon, color, sort_order)
values ('00000000-0000-0000-0000-000000000001', 'Bird Box', '🏠', '#5D7F3A', 0);

-- Point all existing items to the Bird Box type
update items set item_type_id = '00000000-0000-0000-0000-000000000001';

-- Now make item_type_id required
alter table items alter column item_type_id set not null;

-- Create custom field for "Target Species" (was species_target column)
insert into custom_fields (id, item_type_id, name, field_type, options, required, sort_order)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Target Species',
  'dropdown',
  '["Black-capped Chickadee", "Violet-green Swallow", "Tree Swallow", "Bewick''s Wren", "Chestnut-backed Chickadee", "Other"]'::jsonb,
  false,
  0
);

-- Create custom field for "Installed Date" (was installed_date column)
insert into custom_fields (id, item_type_id, name, field_type, required, sort_order)
values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Installed Date',
  'date',
  false,
  1
);

-- Migrate species_target and installed_date into custom_field_values
update items set custom_field_values = jsonb_build_object(
  '00000000-0000-0000-0000-000000000002', species_target,
  '00000000-0000-0000-0000-000000000003', installed_date::text
)
where species_target is not null or installed_date is not null;

-- Drop old columns
alter table items drop column species_target;
alter table items drop column installed_date;

-- Create global update types
insert into update_types (id, name, icon, is_global, sort_order) values
  ('00000000-0000-0000-0000-000000000010', 'Maintenance', '🔧', true, 0),
  ('00000000-0000-0000-0000-000000000011', 'Observation', '👀', true, 1),
  ('00000000-0000-0000-0000-000000000012', 'Note', '📝', true, 2);

-- Create Bird Box-specific update types
insert into update_types (id, name, icon, is_global, item_type_id, sort_order) values
  ('00000000-0000-0000-0000-000000000013', 'Installation', '🏗️', false, '00000000-0000-0000-0000-000000000001', 3),
  ('00000000-0000-0000-0000-000000000014', 'Bird Sighting', '🐦', false, '00000000-0000-0000-0000-000000000001', 4),
  ('00000000-0000-0000-0000-000000000015', 'Damage Report', '⚠️', false, '00000000-0000-0000-0000-000000000001', 5);

-- Migrate existing update_type enum values to update_type_id
update item_updates set update_type_id = '00000000-0000-0000-0000-000000000013'
  where update_type = 'installation';
update item_updates set update_type_id = '00000000-0000-0000-0000-000000000011'
  where update_type = 'observation';
update item_updates set update_type_id = '00000000-0000-0000-0000-000000000010'
  where update_type = 'maintenance';
update item_updates set update_type_id = '00000000-0000-0000-0000-000000000015'
  where update_type = 'damage';
update item_updates set update_type_id = '00000000-0000-0000-0000-000000000014'
  where update_type = 'sighting';

-- Make update_type_id required and drop old column
alter table item_updates alter column update_type_id set not null;
alter table item_updates drop column update_type;

-- Drop bird_species table (replaced by custom fields)
drop policy if exists "Public can view bird species" on bird_species;
drop policy if exists "Admins can insert bird species" on bird_species;
drop policy if exists "Admins can update bird species" on bird_species;
drop policy if exists "Admins can delete bird species" on bird_species;
drop table bird_species;

-- ======================
-- RLS for new tables
-- ======================

alter table site_config enable row level security;
alter table item_types enable row level security;
alter table custom_fields enable row level security;
alter table update_types enable row level security;

-- site_config: public read, admin write
create policy "Public can view site config"
  on site_config for select
  to anon, authenticated
  using (true);

create policy "Admins can insert site config"
  on site_config for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update site config"
  on site_config for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete site config"
  on site_config for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- item_types: public read, admin write
create policy "Public can view item types"
  on item_types for select
  to anon, authenticated
  using (true);

create policy "Admins can insert item types"
  on item_types for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update item types"
  on item_types for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete item types"
  on item_types for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- custom_fields: public read, admin write
create policy "Public can view custom fields"
  on custom_fields for select
  to anon, authenticated
  using (true);

create policy "Admins can insert custom fields"
  on custom_fields for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update custom fields"
  on custom_fields for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete custom fields"
  on custom_fields for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- update_types: public read, admin write
create policy "Public can view update types"
  on update_types for select
  to anon, authenticated
  using (true);

create policy "Admins can insert update types"
  on update_types for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update update types"
  on update_types for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete update types"
  on update_types for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Update existing RLS policy names for renamed tables
alter policy "Public can view birdhouses" on items rename to "Public can view items";
alter policy "Authenticated users can insert birdhouses" on items rename to "Authenticated users can insert items";
alter policy "Authenticated users can update birdhouses" on items rename to "Authenticated users can update items";
alter policy "Admins can delete birdhouses" on items rename to "Admins can delete items";

alter policy "Public can view updates" on item_updates rename to "Public can view item updates";
alter policy "Authenticated users can insert updates" on item_updates rename to "Authenticated users can insert item updates";
alter policy "Authenticated users can update updates" on item_updates rename to "Authenticated users can update item updates";
alter policy "Admins can delete updates" on item_updates rename to "Admins can delete item updates";

-- ======================
-- Seed default site config
-- ======================

insert into site_config (key, value) values
  ('site_name', '"Field Mapper"'::jsonb),
  ('tagline', '"Map and track points of interest"'::jsonb),
  ('location_name', '""'::jsonb),
  ('map_center', '{"lat": 0, "lng": 0, "zoom": 2}'::jsonb),
  ('theme', '{"preset": "forest"}'::jsonb),
  ('about_content', '"# About\n\nDescribe your project here."'::jsonb),
  ('logo_url', 'null'::jsonb),
  ('favicon_url', 'null'::jsonb),
  ('footer_text', '"Built with Field Mapper"'::jsonb),
  ('footer_links', '[]'::jsonb),
  ('custom_map', 'null'::jsonb),
  ('custom_nav_items', '[]'::jsonb),
  ('setup_complete', 'false'::jsonb);

-- ======================
-- Storage bucket rename
-- ======================

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "Public can view item photos storage"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'item-photos');

create policy "Authenticated users can upload item photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos');

create policy "Authenticated users can update own item photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'item-photos');

create policy "Admins can delete item photos from storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos');
