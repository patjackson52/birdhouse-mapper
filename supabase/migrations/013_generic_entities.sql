-- 013_generic_entities.sql — Generalize Species into generic Rich Entities
-- Spec: docs/superpowers/specs/2026-03-26-generic-rich-entities-design.md
--
-- This migration:
--   1. Creates entity_types, entity_type_fields, entities, item_entities, update_entities
--   2. Migrates existing species data into the new tables
--   3. Drops old species, item_species, update_species tables

-- ============================================================================
-- Step 1: Create new tables
-- ============================================================================

-- Entity Types — defines what kinds of rich entities an org has
create table entity_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  icon text not null default '📋',
  color text not null default '#5D7F3A',
  link_to text[] not null default '{items,updates}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Entity Type Fields — custom fields per entity type (beyond fixed common fields)
create table entity_type_fields (
  id uuid primary key default gen_random_uuid(),
  entity_type_id uuid not null references entity_types(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'dropdown', 'date', 'url')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

-- Entities — individual rich entity records
create table entities (
  id uuid primary key default gen_random_uuid(),
  entity_type_id uuid not null references entity_types(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  description text,
  photo_path text,
  external_link text,
  custom_field_values jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Item Entities — many-to-many join (replaces item_species)
create table item_entities (
  item_id uuid not null references items(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete restrict,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (item_id, entity_id)
);

-- Update Entities — many-to-many join (replaces update_species)
create table update_entities (
  update_id uuid not null references item_updates(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete restrict,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (update_id, entity_id)
);

-- ============================================================================
-- Step 2: Indexes
-- ============================================================================

create index idx_entity_types_org on entity_types(org_id);
create index idx_entity_type_fields_type on entity_type_fields(entity_type_id);
create index idx_entities_type on entities(entity_type_id);
create index idx_entities_org on entities(org_id);
create index idx_item_entities_entity on item_entities(entity_id);
create index idx_update_entities_entity on update_entities(entity_id);
create index idx_update_entities_update on update_entities(update_id);

-- ============================================================================
-- Step 3: Updated_at triggers
-- ============================================================================

create trigger entity_types_updated_at
  before update on entity_types
  for each row execute function update_updated_at();

create trigger entities_updated_at
  before update on entities
  for each row execute function update_updated_at();

-- ============================================================================
-- Step 4: Auto-populate org triggers (org-scoped, matches 009 pattern)
-- ============================================================================

create trigger entity_types_auto_org before insert on entity_types
  for each row execute function auto_populate_org_property('org_scoped');
create trigger entity_type_fields_auto_org before insert on entity_type_fields
  for each row execute function auto_populate_org_property('org_scoped');
create trigger entities_auto_org before insert on entities
  for each row execute function auto_populate_org_property('org_scoped');
create trigger item_entities_auto_org before insert on item_entities
  for each row execute function auto_populate_org_property('org_scoped');
create trigger update_entities_auto_org before insert on update_entities
  for each row execute function auto_populate_org_property('org_scoped');

-- ============================================================================
-- Step 5: RLS policies
-- ============================================================================

alter table entity_types enable row level security;
alter table entity_type_fields enable row level security;
alter table entities enable row level security;
alter table item_entities enable row level security;
alter table update_entities enable row level security;

-- entity_types: public read, org-admin writes (matches item_types pattern from 009)
create policy "entity_types_public_read" on entity_types for select
  to anon, authenticated using (true);
create policy "entity_types_insert" on entity_types for insert
  to authenticated with check (org_id in (select user_org_admin_org_ids()));
create policy "entity_types_update" on entity_types for update
  to authenticated using (org_id in (select user_org_admin_org_ids()));
create policy "entity_types_delete" on entity_types for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- entity_type_fields: public read, org-admin writes (matches custom_fields pattern from 009)
create policy "entity_type_fields_public_read" on entity_type_fields for select
  to anon, authenticated using (true);
create policy "entity_type_fields_insert" on entity_type_fields for insert
  to authenticated with check (org_id in (select user_org_admin_org_ids()));
create policy "entity_type_fields_update" on entity_type_fields for update
  to authenticated using (org_id in (select user_org_admin_org_ids()));
create policy "entity_type_fields_delete" on entity_type_fields for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- entities: public read, org-admin writes (matches species pattern from 009)
create policy "entities_public_read" on entities for select
  to anon, authenticated using (true);
create policy "entities_insert" on entities for insert
  to authenticated with check (org_id in (select user_org_admin_org_ids()));
create policy "entities_update" on entities for update
  to authenticated using (org_id in (select user_org_admin_org_ids()));
create policy "entities_delete" on entities for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- item_entities: public read, org-admin writes (matches item_species pattern from 009)
create policy "item_entities_public_read" on item_entities for select
  to anon, authenticated using (true);
create policy "item_entities_insert" on item_entities for insert
  to authenticated with check (org_id in (select user_org_admin_org_ids()));
create policy "item_entities_delete" on item_entities for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- update_entities: public read, org-admin writes (matches update_species pattern from 009)
create policy "update_entities_public_read" on update_entities for select
  to anon, authenticated using (true);
create policy "update_entities_insert" on update_entities for insert
  to authenticated with check (org_id in (select user_org_admin_org_ids()));
create policy "update_entities_delete" on update_entities for delete
  to authenticated using (org_id in (select user_org_admin_org_ids()));

-- ============================================================================
-- Step 5: Migrate species data
-- ============================================================================

-- 5a. Create temporary mapping tables
create temp table _org_entity_type_map (
  org_id uuid,
  entity_type_id uuid
);

create temp table _org_field_map (
  org_id uuid,
  scientific_name_field_id uuid,
  conservation_status_field_id uuid,
  category_field_id uuid
);

create temp table _species_entity_map (
  old_species_id uuid,
  new_entity_id uuid
);

-- 5b. Create entity_type "Species" per org that has species data
insert into _org_entity_type_map (org_id, entity_type_id)
select distinct org_id, gen_random_uuid()
from species;

insert into entity_types (id, org_id, name, icon, color, link_to, sort_order)
select entity_type_id, org_id, 'Species', '🐦', '#5D7F3A', '{items,updates}', 0
from _org_entity_type_map;

-- 5c. Create entity_type_fields for each org's Species entity type
insert into _org_field_map (org_id, scientific_name_field_id, conservation_status_field_id, category_field_id)
select org_id, gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
from _org_entity_type_map;

insert into entity_type_fields (id, entity_type_id, org_id, name, field_type, sort_order)
select
  fm.scientific_name_field_id,
  etm.entity_type_id,
  etm.org_id,
  'Scientific Name',
  'text',
  0
from _org_entity_type_map etm
join _org_field_map fm on fm.org_id = etm.org_id;

insert into entity_type_fields (id, entity_type_id, org_id, name, field_type, sort_order)
select
  fm.conservation_status_field_id,
  etm.entity_type_id,
  etm.org_id,
  'Conservation Status',
  'text',
  1
from _org_entity_type_map etm
join _org_field_map fm on fm.org_id = etm.org_id;

insert into entity_type_fields (id, entity_type_id, org_id, name, field_type, sort_order)
select
  fm.category_field_id,
  etm.entity_type_id,
  etm.org_id,
  'Category',
  'text',
  2
from _org_entity_type_map etm
join _org_field_map fm on fm.org_id = etm.org_id;

-- 5d. Copy species → entities with custom_field_values
insert into _species_entity_map (old_species_id, new_entity_id)
select id, gen_random_uuid()
from species;

insert into entities (id, entity_type_id, org_id, name, description, photo_path, external_link, custom_field_values, sort_order, created_at, updated_at)
select
  sem.new_entity_id,
  etm.entity_type_id,
  s.org_id,
  s.name,
  s.description,
  s.photo_path,
  s.external_link,
  jsonb_build_object(
    fm.scientific_name_field_id::text, s.scientific_name,
    fm.conservation_status_field_id::text, s.conservation_status,
    fm.category_field_id::text, s.category
  ),
  s.sort_order,
  s.created_at,
  s.updated_at
from species s
join _species_entity_map sem on sem.old_species_id = s.id
join _org_entity_type_map etm on etm.org_id = s.org_id
join _org_field_map fm on fm.org_id = s.org_id;

-- 5e. Copy item_species → item_entities
insert into item_entities (item_id, entity_id, org_id)
select
  isp.item_id,
  sem.new_entity_id,
  isp.org_id
from item_species isp
join _species_entity_map sem on sem.old_species_id = isp.species_id;

-- 5f. Copy update_species → update_entities
insert into update_entities (update_id, entity_id, org_id)
select
  usp.update_id,
  sem.new_entity_id,
  usp.org_id
from update_species usp
join _species_entity_map sem on sem.old_species_id = usp.species_id;

-- 5g. Drop temporary tables
drop table _species_entity_map;
drop table _org_field_map;
drop table _org_entity_type_map;

-- ============================================================================
-- Step 6: Drop old species tables
-- ============================================================================

-- Drop auto-org triggers
drop trigger if exists update_species_auto_org on update_species;
drop trigger if exists item_species_auto_org on item_species;
drop trigger if exists species_auto_org on species;
drop trigger if exists species_updated_at on species;

-- Drop RLS policies (names from migration 009)
drop policy if exists "update_species_public_read" on update_species;
drop policy if exists "update_species_insert" on update_species;
drop policy if exists "update_species_delete" on update_species;

drop policy if exists "item_species_public_read" on item_species;
drop policy if exists "item_species_insert" on item_species;
drop policy if exists "item_species_delete" on item_species;

drop policy if exists "species_public_read" on species;
drop policy if exists "species_insert" on species;
drop policy if exists "species_update" on species;
drop policy if exists "species_delete" on species;

-- Drop tables (join tables first due to FK constraints)
drop table update_species;
drop table item_species;
drop table species;
