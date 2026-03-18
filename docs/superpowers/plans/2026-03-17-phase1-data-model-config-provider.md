# Phase 1: Data Model + Config Provider — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the new database tables (`site_config`, `item_types`, `custom_fields`, `update_types`), rename existing tables to generic names, migrate seed data, and build the config provider (`getConfig()`, `ConfigProvider`, `useConfig()`) so the rest of the app can read configuration from the database.

**Architecture:** New Supabase migration creates all new tables with RLS, renames `birdhouses` → `items` and `birdhouse_updates` → `item_updates`, migrates seed data to the new schema. A server-side `getConfig()` function fetches config with caching. A React context `ConfigProvider` wraps the app so all components can access config via `useConfig()`.

**Tech Stack:** Supabase (PostgreSQL), Next.js 14 (App Router), TypeScript, `@supabase/ssr`

**Spec:** `docs/superpowers/specs/2026-03-17-generic-field-mapper-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/002_generic_schema.sql` | New tables, table renames, data migration, RLS policies |
| `supabase/scripts/migrate-storage-bucket.ts` | Script to copy storage objects from `birdhouse-photos` to `item-photos` |
| `src/lib/config/types.ts` | `SiteConfig` interface and related types |
| `src/lib/config/server.ts` | `getConfig()` with caching, `getConfigValue()` helper |
| `src/lib/config/client.tsx` | `ConfigProvider` context and `useConfig()` hook |
| `src/lib/config/defaults.ts` | Default config values seeded on first run |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Replace birdhouse types with generic item types, add new table types |
| `src/app/layout.tsx` | Wrap children in `ConfigProvider`, make metadata dynamic |
| `src/middleware.ts` | Add `/setup` matcher, add setup-complete check |
| `src/lib/supabase/middleware.ts` | Add setup redirect logic with cookie optimization |
| `src/lib/supabase/server.ts` | Add `createServiceClient()` for setup wizard writes |

---

## Chunk 1: Database Migration

### Task 1: Create the migration SQL file

**Files:**
- Create: `supabase/migrations/002_generic_schema.sql`

This is a large SQL migration. It must be run against the Supabase SQL editor after the initial schema (001) is in place.

- [ ] **Step 1: Write the new tables section of the migration**

```sql
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
```

- [ ] **Step 2: Write the table rename and column migration section**

Append to the same file:

```sql
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
-- (The FK itself still works after table rename, but let's rename the index)
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
```

- [ ] **Step 3: Write the seed data migration section**

Append to the same file. This creates the default "Bird Box" item type, migrates existing data, and seeds default config:

```sql
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
```

- [ ] **Step 4: Write the RLS policies section**

Append to the same file:

```sql
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
-- (PostgreSQL keeps policies working after ALTER TABLE RENAME,
--  but we rename them for clarity)

-- Rename birdhouse policies to item policies
alter policy "Public can view birdhouses" on items rename to "Public can view items";
alter policy "Authenticated users can insert birdhouses" on items rename to "Authenticated users can insert items";
alter policy "Authenticated users can update birdhouses" on items rename to "Authenticated users can update items";
alter policy "Admins can delete birdhouses" on items rename to "Admins can delete items";

-- Rename birdhouse_updates policies to item_updates policies
alter policy "Public can view updates" on item_updates rename to "Public can view item updates";
alter policy "Authenticated users can insert updates" on item_updates rename to "Authenticated users can insert item updates";
alter policy "Authenticated users can update updates" on item_updates rename to "Authenticated users can update item updates";
alter policy "Admins can delete updates" on item_updates rename to "Admins can delete item updates";
```

- [ ] **Step 5: Write the default config seed section**

Append to the same file:

```sql
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

-- Create new bucket (storage bucket rename must be done via script, not SQL)
-- See supabase/scripts/migrate-storage-bucket.ts
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Add policies for new bucket
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
```

- [ ] **Step 6: Review the full migration file**

Read `supabase/migrations/002_generic_schema.sql` end-to-end and verify:
- No references to old table names in new policies
- FK constraints are consistent
- Seed data UUIDs don't conflict
- All sections are in correct dependency order

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/002_generic_schema.sql
git commit -m "feat: add migration for generic field mapper schema"
```

---

### Task 2: Create the storage bucket migration script

**Files:**
- Create: `supabase/scripts/migrate-storage-bucket.ts`

This standalone script copies photos from `birdhouse-photos` to `item-photos` bucket, updates the `photos` table, and removes the old bucket. Run manually after applying the SQL migration.

- [ ] **Step 1: Write the migration script**

```typescript
/**
 * Storage bucket migration: birdhouse-photos → item-photos
 *
 * Usage: npx tsx supabase/scripts/migrate-storage-bucket.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OLD_BUCKET = 'birdhouse-photos';
const NEW_BUCKET = 'item-photos';

async function migrate() {
  console.log(`Migrating storage from "${OLD_BUCKET}" to "${NEW_BUCKET}"...`);

  // List all files in old bucket
  const { data: files, error: listError } = await supabase.storage
    .from(OLD_BUCKET)
    .list('', { limit: 1000 });

  if (listError) {
    console.error('Failed to list files:', listError.message);
    process.exit(1);
  }

  if (!files || files.length === 0) {
    console.log('No files to migrate.');
  } else {
    // Copy each file
    for (const file of files) {
      // Files may be in subdirectories (e.g., {birdhouse_id}/photo.jpg)
      // We need to list recursively
      const { data: subFiles, error: subError } = await supabase.storage
        .from(OLD_BUCKET)
        .list(file.name, { limit: 1000 });

      if (subError) {
        console.warn(`Warning: could not list ${file.name}:`, subError.message);
        continue;
      }

      if (subFiles && subFiles.length > 0) {
        // It's a directory — copy each file inside
        for (const subFile of subFiles) {
          const path = `${file.name}/${subFile.name}`;
          await copyFile(path);
        }
      } else {
        // It's a top-level file
        await copyFile(file.name);
      }
    }
  }

  // Update photos table: replace old bucket name in storage_path.
  // The Supabase JS client cannot do string replace, so log the SQL for manual execution.
  console.log('\nRun this SQL in the Supabase SQL editor to update photo references:');
  console.log(`UPDATE photos SET storage_path = replace(storage_path, '${OLD_BUCKET}', '${NEW_BUCKET}');`);

  console.log('\nMigration complete.');
  console.log(`Old bucket "${OLD_BUCKET}" can be deleted manually once verified.`);
}

async function copyFile(path: string) {
  // Download from old bucket
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(OLD_BUCKET)
    .download(path);

  if (downloadError) {
    console.warn(`Warning: could not download ${path}:`, downloadError.message);
    return;
  }

  // Upload to new bucket
  const { error: uploadError } = await supabase.storage
    .from(NEW_BUCKET)
    .upload(path, fileData, { upsert: true });

  if (uploadError) {
    console.warn(`Warning: could not upload ${path}:`, uploadError.message);
    return;
  }

  console.log(`  Copied: ${path}`);
}

migrate().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/scripts/migrate-storage-bucket.ts
git commit -m "feat: add storage bucket migration script"
```

---

## Chunk 2: TypeScript Types

### Task 3: Update TypeScript types for generic schema

**Files:**
- Modify: `src/lib/types.ts` (full rewrite)

- [ ] **Step 1: Write the updated types file**

Replace the entire contents of `src/lib/types.ts`:

```typescript
// ======================
// Enums / Union types
// ======================

export type ItemStatus = 'active' | 'planned' | 'damaged' | 'removed';

export type FieldType = 'text' | 'number' | 'dropdown' | 'date';

export type UserRole = 'admin' | 'editor';

// ======================
// Table interfaces
// ======================

export interface Item {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  item_type_id: string;
  custom_field_values: Record<string, unknown>;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ItemType {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface CustomField {
  id: string;
  item_type_id: string;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface UpdateType {
  id: string;
  name: string;
  icon: string;
  is_global: boolean;
  item_type_id: string | null;
  sort_order: number;
}

export interface ItemUpdate {
  id: string;
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  created_at: string;
  created_by: string | null;
}

export interface Photo {
  id: string;
  item_id: string | null;
  update_id: string | null;
  storage_path: string;
  caption: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface SiteConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
}

// ======================
// Composite types
// ======================

export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[] })[];
  photos: Photo[];
  custom_fields: CustomField[]; // field definitions for this item's type
}

// ======================
// Database schema type (for Supabase client)
// ======================

export interface Database {
  public: {
    Tables: {
      items: {
        Row: Item;
        Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Item, 'id' | 'created_at'>>;
        Relationships: [];
      };
      item_types: {
        Row: ItemType;
        Insert: Omit<ItemType, 'id' | 'created_at'>;
        Update: Partial<Omit<ItemType, 'id' | 'created_at'>>;
        Relationships: [];
      };
      custom_fields: {
        Row: CustomField;
        Insert: Omit<CustomField, 'id'>;
        Update: Partial<Omit<CustomField, 'id'>>;
        Relationships: [];
      };
      update_types: {
        Row: UpdateType;
        Insert: Omit<UpdateType, 'id'>;
        Update: Partial<Omit<UpdateType, 'id'>>;
        Relationships: [];
      };
      item_updates: {
        Row: ItemUpdate;
        Insert: Omit<ItemUpdate, 'id' | 'created_at'>;
        Update: Partial<Omit<ItemUpdate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      photos: {
        Row: Photo;
        Insert: Omit<Photo, 'id' | 'created_at'>;
        Update: Partial<Omit<Photo, 'id' | 'created_at'>>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      site_config: {
        Row: SiteConfigRow;
        Insert: Omit<SiteConfigRow, 'updated_at'>;
        Update: Partial<Omit<SiteConfigRow, 'key'>>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/types.ts`

Expected: Type errors in files that import old types (this is expected — we'll fix those in Phase 2). The types file itself should have no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update TypeScript types for generic item schema"
```

---

## Chunk 3: Config Provider

### Task 4: Create config type definitions

**Files:**
- Create: `src/lib/config/types.ts`

- [ ] **Step 1: Write the SiteConfig interface and theme types**

```typescript
export interface SiteConfig {
  siteName: string;
  tagline: string;
  locationName: string;
  mapCenter: { lat: number; lng: number; zoom: number };
  theme: { preset: string; overrides?: Record<string, string> };
  aboutContent: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string;
  footerLinks: { label: string; url: string }[];
  customMap: {
    url: string;
    bounds: {
      southWest: { lat: number; lng: number };
      northEast: { lat: number; lng: number };
    };
    rotation: number;
    corners?: {
      topLeft: { lat: number; lng: number };
      topRight: { lat: number; lng: number };
      bottomLeft: { lat: number; lng: number };
    };
    opacity: number;
  } | null;
  customNavItems: { label: string; href: string }[];
  setupComplete: boolean;
}

/** Maps site_config DB keys to SiteConfig property names */
export const CONFIG_KEY_MAP: Record<string, keyof SiteConfig> = {
  site_name: 'siteName',
  tagline: 'tagline',
  location_name: 'locationName',
  map_center: 'mapCenter',
  theme: 'theme',
  about_content: 'aboutContent',
  logo_url: 'logoUrl',
  favicon_url: 'faviconUrl',
  footer_text: 'footerText',
  footer_links: 'footerLinks',
  custom_map: 'customMap',
  custom_nav_items: 'customNavItems',
  setup_complete: 'setupComplete',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config/types.ts
git commit -m "feat: add SiteConfig type definitions"
```

---

### Task 5: Create config defaults

**Files:**
- Create: `src/lib/config/defaults.ts`

- [ ] **Step 1: Write default config values**

```typescript
import type { SiteConfig } from './types';

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'Field Mapper',
  tagline: 'Map and track points of interest',
  locationName: '',
  mapCenter: { lat: 0, lng: 0, zoom: 2 },
  theme: { preset: 'forest' },
  aboutContent: '# About\n\nDescribe your project here.',
  logoUrl: null,
  faviconUrl: null,
  footerText: 'Built with Field Mapper',
  footerLinks: [],
  customMap: null,
  customNavItems: [],
  setupComplete: false,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config/defaults.ts
git commit -m "feat: add default config values"
```

---

### Task 6: Create server-side config fetcher

**Files:**
- Create: `src/lib/config/server.ts`
- Modify: `src/lib/supabase/server.ts` (add service client)

- [ ] **Step 1: Add service role client to server.ts**

Add this function to the end of `src/lib/supabase/server.ts`:

```typescript
import { createClient as createRawClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service role key.
 * Bypasses RLS — use only in server-side code (setup wizard, migrations).
 * NEVER expose this client or key to the browser.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 2: Write the server-side getConfig function**

Create `src/lib/config/server.ts`:

```typescript
import { unstable_cache, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_CONFIG } from './defaults';
import { CONFIG_KEY_MAP, type SiteConfig } from './types';

const CACHE_TAG = 'site-config';

/**
 * Creates a lightweight Supabase client for config reads.
 * Uses anon key only — no cookies needed since site_config has public SELECT.
 * This avoids issues with unstable_cache running outside request context.
 */
function createConfigClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetches all site config from the database.
 * Cached for 60 seconds, busted immediately via revalidateTag on admin save.
 */
export const getConfig = unstable_cache(
  async (): Promise<SiteConfig> => {
    const supabase = createConfigClient();
    const { data, error } = await supabase
      .from('site_config')
      .select('key, value');

    if (error || !data) {
      console.error('Failed to fetch site config:', error?.message);
      return { ...DEFAULT_CONFIG };
    }

    const config = { ...DEFAULT_CONFIG };

    for (const row of data) {
      const propName = CONFIG_KEY_MAP[row.key];
      if (propName) {
        (config as Record<string, unknown>)[propName] = row.value;
      }
    }

    return config;
  },
  [CACHE_TAG],
  { revalidate: 60, tags: [CACHE_TAG] }
);

/**
 * Call this after saving config in admin to immediately bust the cache.
 */
export function invalidateConfig() {
  revalidateTag(CACHE_TAG);
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`

Expected: Errors in components still using old types (expected for Phase 2). No errors in the new config files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/server.ts src/lib/supabase/server.ts
git commit -m "feat: add server-side config fetcher with caching"
```

---

### Task 7: Create client-side ConfigProvider and useConfig hook

**Files:**
- Create: `src/lib/config/client.tsx`

- [ ] **Step 1: Write the ConfigProvider and useConfig hook**

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';

const ConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG);

interface ConfigProviderProps {
  config: SiteConfig;
  children: ReactNode;
}

export function ConfigProvider({ config, children }: ConfigProviderProps) {
  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Access site configuration from any client component.
 * Must be used within a ConfigProvider (which wraps the app in layout.tsx).
 */
export function useConfig(): SiteConfig {
  return useContext(ConfigContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config/client.tsx
git commit -m "feat: add ConfigProvider context and useConfig hook"
```

---

### Task 8: Wire ConfigProvider into the app layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update layout.tsx to fetch config and wrap in ConfigProvider**

Replace the contents of `src/app/layout.tsx` with:

```tsx
import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';

// Metadata will be made dynamic in Phase 3 (theming).
// For now, use a simple default that doesn't reference IslandWood.
export const metadata = {
  title: 'Field Mapper',
  description: 'Map and track points of interest',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getConfig();

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config}>
          <Navigation />
          <main className="flex-1">{children}</main>
        </ConfigProvider>
      </body>
    </html>
  );
}
```

Note: The layout is now an `async` server component that fetches config, then passes it to the client `ConfigProvider`. The `Navigation` component is inside the provider and will be updated in Phase 2 to read from config.

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: wire ConfigProvider into root layout"
```

---

## Chunk 4: Middleware Setup Check

### Task 9: Add setup-complete redirect to middleware

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Update the middleware matcher to include all routes**

Replace `src/middleware.ts`:

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Add setup redirect logic to middleware.ts**

Replace `src/lib/supabase/middleware.ts` with the updated version that checks for setup completion:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // --- Setup complete check ---
  const pathname = request.nextUrl.pathname;
  const isSetupRoute = pathname === '/setup' || pathname.startsWith('/setup/');
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isStaticAsset = pathname.startsWith('/_next/');

  if (!isSetupRoute && !isAuthCallback && !isStaticAsset) {
    const setupDoneCookie = request.cookies.get('setup_done');

    if (!setupDoneCookie) {
      // Check database for setup_complete
      const { data } = await supabase
        .from('site_config')
        .select('value')
        .eq('key', 'setup_complete')
        .single();

      const setupComplete = data?.value === true;

      if (setupComplete) {
        // Set cookie so we don't check DB on every request
        supabaseResponse.cookies.set('setup_done', 'true', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365, // 1 year
        });
      } else {
        // Redirect to setup
        const url = request.nextUrl.clone();
        url.pathname = '/setup';
        return NextResponse.redirect(url);
      }
    }
  }

  // --- Auth checks (only for protected routes) ---
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin');

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Check admin role for /admin routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/manage';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build`

Expected: Build may have warnings about components using old type names (Phase 2 will fix these). The middleware and config provider should compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/lib/supabase/middleware.ts
git commit -m "feat: add setup-complete redirect to middleware"
```

---

## Chunk 5: Verification & Cleanup

### Task 10: Create a placeholder setup page

**Files:**
- Create: `src/app/setup/page.tsx`

The setup wizard UI is built in Phase 5. For now, create a placeholder so the redirect works and doesn't 404.

- [ ] **Step 1: Write the placeholder setup page**

```tsx
export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Setup</h1>
        <p className="text-gray-600">
          Setup wizard coming soon. Set <code>setup_complete</code> to{' '}
          <code>true</code> in <code>site_config</code> to bypass.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/setup/page.tsx
git commit -m "feat: add placeholder setup page for redirect target"
```

---

### Task 11: Verify end-to-end config flow

This task verifies the full Phase 1 chain works: migration → config in DB → getConfig() → ConfigProvider → useConfig().

- [ ] **Step 1: Create a temporary test component**

Create `src/app/config-test/page.tsx`:

```tsx
import { getConfig } from '@/lib/config/server';

export default async function ConfigTestPage() {
  const config = await getConfig();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Config Test</h1>
      <pre className="bg-gray-100 p-4 rounded overflow-auto">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server and verify**

Run: `npm run dev`

Then visit `http://localhost:3000/config-test`. You should see the config JSON rendered. If `setup_complete` is `false`, you'll be redirected to `/setup` — temporarily set it to `true` in Supabase to test the config page, then set it back.

- [ ] **Step 3: Remove the test page and commit**

```bash
rm -rf src/app/config-test
git add -A
git commit -m "chore: verify config flow and clean up test page"
```

---

## Summary

After Phase 1 is complete:

- **Database** has new tables (`site_config`, `item_types`, `custom_fields`, `update_types`), renamed tables (`items`, `item_updates`), migrated data, and full RLS
- **TypeScript types** reflect the new schema
- **Config provider** fetches config from DB with caching and serves it via React context
- **Middleware** redirects to `/setup` when `setup_complete` is false
- **Placeholder setup page** exists as redirect target

The app will have type errors in components still referencing old types (`Birdhouse`, `BirdhouseUpdate`, etc.) — these are resolved in **Phase 2: Generic Item System**.
