# Generic Rich Entities Design

**Date:** 2026-03-26
**Status:** Draft

## Context

Species is currently a hardcoded "rich entity" in FieldMapper — it has its own table with rich fields (name, scientific_name, description, photo, conservation_status, category, external_link), join tables to items (`item_species`) and updates (`update_species`), dedicated admin UI, and a custom selector component. This works well for bird-tracking orgs, but other orgs need their own domain-specific rich entities (e.g., Volunteers, Materials, Habitats, Equipment).

This design generalizes Species into a generic Rich Entity system where any org can define their own entity types with custom fields, link them to items and/or updates, and get AI-generated suggestions during onboarding.

## Requirements

1. **Generic entity types** — Orgs define rich entity types (like "Species", "Volunteers") with configurable fields
2. **Fixed common fields** — Every entity gets: name, description, photo, external_link
3. **Custom fields per type** — Each entity type can have additional fields (text, number, dropdown, date, url)
4. **Configurable linking** — Each entity type specifies whether it links to items, updates, or both
5. **AI onboarding** — During org onboarding, AI suggests entity types and their fields based on user description
6. **AI admin access** — Existing orgs can also use AI to generate entity type suggestions from the admin panel
7. **Migration** — Existing species data migrates cleanly to the new generic system

## Database Schema

### New Tables

#### `entity_types`

Defines what kinds of rich entities an org has.

```sql
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
```

#### `entity_type_fields`

Custom fields beyond the fixed common fields, defined per entity type.

```sql
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
```

#### `entities`

Individual rich entity records.

```sql
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
```

#### `item_entities`

Many-to-many join between items and entities. Replaces `item_species`.

```sql
create table item_entities (
  item_id uuid not null references items(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete restrict,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (item_id, entity_id)
);
```

#### `update_entities`

Many-to-many join between updates and entities. Replaces `update_species`.

```sql
create table update_entities (
  update_id uuid not null references item_updates(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete restrict,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (update_id, entity_id)
);
```

### Indexes

```sql
create index idx_entity_types_org on entity_types(org_id);
create index idx_entity_type_fields_type on entity_type_fields(entity_type_id);
create index idx_entities_type on entities(entity_type_id);
create index idx_entities_org on entities(org_id);
create index idx_item_entities_entity on item_entities(entity_id);
create index idx_update_entities_entity on update_entities(entity_id);
create index idx_update_entities_update on update_entities(update_id);
```

### RLS Policies

- **Public read** (anon + authenticated) on all five tables
- **Admin-only write** on `entity_types` and `entity_type_fields` (matches `item_types` / `custom_fields` pattern — requires `profiles.role = 'admin'`)
- **Authenticated write** on `entities`, `item_entities`, `update_entities` (matches existing `species` / `item_species` pattern)

### Updated_at Triggers

```sql
create trigger entity_types_updated_at before update on entity_types
  for each row execute function update_updated_at();
create trigger entities_updated_at before update on entities
  for each row execute function update_updated_at();
```

## Migration: Species → Entities

Executed in a single migration file as one transaction.

### Phase 1 — Create new tables
Create all five tables with indexes, RLS policies, and triggers.

### Phase 2 — Migrate species data

```sql
-- 1. Create entity_type "Species" per org
insert into entity_types (id, org_id, name, icon, color, link_to, sort_order)
select gen_random_uuid(), org_id, 'Species', '🐦', '#5D7F3A', '{items,updates}', 0
from (select distinct org_id from species) orgs;

-- 2. Create entity_type_fields for species-specific fields
-- For each org's Species entity_type:
--   "Scientific Name" (text), "Conservation Status" (text), "Category" (text)

-- 3. Copy species → entities
-- Map name, description, photo_path, external_link directly
-- Pack scientific_name, conservation_status, category into custom_field_values

-- 4. Copy item_species → item_entities (using species_id → entity_id mapping)
-- 5. Copy update_species → update_entities (same mapping)
```

### Phase 3 — Drop old tables
```sql
drop table update_species;
drop table item_species;
drop table species;
```

A temporary mapping table tracks `old_species_id → new_entity_id` to ensure join table copies are accurate. Full transaction rollback on any failure.

## TypeScript Types

### New types in `src/lib/types.ts`

```typescript
export type EntityLinkTarget = 'items' | 'updates';

export interface EntityType {
  id: string;
  org_id: string;
  name: string;
  icon: string;
  color: string;
  link_to: EntityLinkTarget[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EntityTypeField {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date' | 'url';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface Entity {
  id: string;
  entity_type_id: string;
  org_id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  external_link: string | null;
  custom_field_values: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemEntity {
  item_id: string;
  entity_id: string;
  org_id: string;
}

export interface UpdateEntity {
  update_id: string;
  entity_id: string;
  org_id: string;
}
```

### Updated `ItemWithDetails`

```typescript
export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & {
    update_type: UpdateType;
    photos: Photo[];
    entities: (Entity & { entity_type: EntityType })[];  // was: species: Species[]
  })[];
  photos: Photo[];
  custom_fields: CustomField[];
  entities: (Entity & { entity_type: EntityType })[];  // was: species: Species[]
}
```

## UI Components

### New Generic Components

#### `EntitySelect` (replaces `SpeciesSelect`)
- **File:** `src/components/manage/EntitySelect.tsx`
- **Props:** `entityTypeId: string`, `selectedIds: string[]`, `onChange: (ids: string[]) => void`
- Fetches entities of the given type on mount, sorted by `sort_order`
- Same toggle/badge/dropdown UI pattern as SpeciesSelect
- Rendered once per entity type linked to the current context (item form or update form)

#### `EntityForm` (replaces `SpeciesForm`)
- **File:** `src/components/admin/EntityForm.tsx`
- **Props:** `entityType: EntityType`, `fields: EntityTypeField[]`, `entity?: Entity`, `onSaved`, `onCancel`
- Always renders fixed common fields: name, description, photo upload, external_link
- Dynamically renders custom fields based on `fields` prop
- Same photo upload pattern: `item-photos` bucket, path `entities/{id}/{timestamp}.jpg`

#### `EntityCard` (replaces `SpeciesCard`)
- **File:** `src/components/admin/EntityCard.tsx`
- **Props:** `entity: Entity`, `entityType: EntityType`, `fields: EntityTypeField[]`, `onEdit`, `onDelete`
- Shows photo thumbnail, name, description, custom field values

#### `EntityTypeForm` (new)
- **File:** `src/components/admin/EntityTypeForm.tsx`
- Configure name, icon, color
- `link_to` checkboxes: "Link to Items", "Link to Updates"
- Inline field editor: add/remove/reorder custom fields with type selection

### Page Changes

#### Admin sidebar navigation
- **File:** `src/app/admin/properties/[slug]/layout.tsx`
- Currently hardcoded `{ label: 'Species', href: '...' }`
- Change to: fetch entity types for the org, dynamically generate nav items
- Each entity type gets route: `/admin/properties/[slug]/entities/[entityTypeId]`

#### Admin entity type management page (new)
- **File:** `src/app/admin/properties/[slug]/entities/[entityTypeId]/page.tsx`
- Same pattern as current species page: list entities, search/filter, add/edit/delete
- Uses `EntityForm`, `EntityCard` components

#### Admin entity types list page (new)
- **File:** `src/app/admin/properties/[slug]/entity-types/page.tsx`
- List all entity types with CRUD
- Uses `EntityTypeForm`
- "Generate with AI" button

#### Item/Update forms
- **Files:** `src/components/manage/ItemForm.tsx`, `EditItemForm.tsx`, `UpdateForm.tsx`
- Replace single `<SpeciesSelect>` with a loop over entity types:
  - Fetch entity types where `link_to` includes 'items' (for item forms) or 'updates' (for update forms)
  - Render one `<EntitySelect entityTypeId={et.id}>` per entity type
- Join table writes change from `item_species` → `item_entities` (same delete-then-insert pattern)

#### DetailPanel / UpdateTimeline
- **Files:** `src/components/item/DetailPanel.tsx`, `src/components/item/UpdateTimeline.tsx`
- Replace hardcoded species badge section with grouped entity display
- Group entities by `entity_type`, show type icon and name as section header, entities as badges

#### HomeMapView query
- **File:** `src/components/map/HomeMapView.tsx`
- Replace `item_species` / `update_species` queries with `item_entities` / `update_entities`
- Use `.select("entity_id, entities(*, entity_types(*))")` to hydrate entity + type in one query

## AI Onboarding

### New Onboarding Step

**Position:** Between "items" and "about" steps.

**Updated step order:** `'welcome' | 'name' | 'theme' | 'custommap' | 'items' | 'entities' | 'about' | 'review'`

### User Flow

1. User sees the item types they just defined and a text input
2. Prompt: **"Describe what you'd like to track about your items"**
3. Placeholder: *"We track bird species that nest in our boxes, and the volunteers who maintain them"*
4. User types description, clicks **"Generate Suggestions"**
5. AI returns entity type suggestions rendered as editable cards
6. User can accept, edit, remove suggestions, or add manually
7. On launch, `onboardCreateOrg()` creates entity types and fields

### AI Server Action

**File:** `src/app/onboard/actions.ts` (new export)

```typescript
export async function generateEntityTypeSuggestions(input: {
  orgName: string;
  itemTypes: string[];
  userPrompt: string;
}): Promise<{ suggestions: EntityTypeSuggestion[] } | { error: string }>
```

**Implementation pattern:** Same as `generateLandingPage()` in `src/app/admin/landing/actions.ts`:
- Uses `generateText` from `ai` SDK with `anthropic('claude-sonnet-4-6')`
- System prompt with org context (name, item types)
- Returns structured JSON validated with Zod schema
- Response shape:
```json
[
  {
    "name": "Species",
    "icon": "🐦",
    "color": "#5D7F3A",
    "link_to": ["items", "updates"],
    "fields": [
      { "name": "Scientific Name", "field_type": "text", "required": false },
      { "name": "Conservation Status", "field_type": "dropdown", "options": ["LC", "NT", "VU", "EN", "CR"] }
    ]
  }
]
```

### AI in Admin Panel

The same `generateEntityTypeSuggestions` action is reusable from the admin entity types page via a "Generate with AI" button, so existing orgs can add entity types with AI assistance anytime.

### Onboard Action Extension

`onboardCreateOrg()` in `src/app/onboard/actions.ts` gains a new optional field:

```typescript
export interface OnboardConfig {
  // ... existing fields ...
  entityTypes?: Array<{
    name: string;
    icon: string;
    color: string;
    link_to: string[];
    fields: Array<{ name: string; field_type: string; options?: string[]; required?: boolean }>;
  }>;
}
```

After creating item types (step 8), a new step inserts entity types and their fields.

## Files to Modify

### New Files
- `src/components/manage/EntitySelect.tsx`
- `src/components/admin/EntityForm.tsx`
- `src/components/admin/EntityCard.tsx`
- `src/components/admin/EntityTypeForm.tsx`
- `src/app/admin/properties/[slug]/entities/[entityTypeId]/page.tsx`
- `src/app/admin/properties/[slug]/entity-types/page.tsx`
- `supabase/migrations/XXXX_generic_entities.sql`

### Modified Files
- `src/lib/types.ts` — New interfaces, update ItemWithDetails
- `src/app/onboard/page.tsx` — Add 'entities' step
- `src/app/onboard/actions.ts` — Add generateEntityTypeSuggestions, extend onboardCreateOrg
- `src/app/admin/properties/[slug]/layout.tsx` — Dynamic nav from entity types
- `src/components/manage/ItemForm.tsx` — Replace SpeciesSelect with EntitySelect loop
- `src/components/manage/EditItemForm.tsx` — Same replacement
- `src/components/manage/UpdateForm.tsx` — Same replacement
- `src/components/item/DetailPanel.tsx` — Generic entity display
- `src/components/item/UpdateTimeline.tsx` — Generic entity display
- `src/components/map/HomeMapView.tsx` — Update queries to use new join tables
- `src/app/manage/edit/[id]/page.tsx` — Fetch entity IDs from item_entities

### Deleted Files
- `src/components/manage/SpeciesSelect.tsx`
- `src/components/admin/SpeciesForm.tsx`
- `src/components/admin/SpeciesCard.tsx`
- `src/app/admin/properties/[slug]/species/page.tsx`

## Verification

### Database
- Run migration on local Supabase with seed species data
- Verify entity counts match species counts post-migration
- Verify join table counts match
- Test RLS: anon read, authenticated write, delete restricted when linked

### Unit Tests (Vitest)
- EntitySelect: renders entities, toggles selection, calls onChange
- EntityForm: renders common fields + dynamic custom fields, validates, submits
- EntityTypeForm: add/remove/reorder custom fields
- Type tests for new interfaces

### Integration / Manual Testing
- New org onboarding → describe entities → verify AI suggestions → launch → verify DB
- Admin: navigate to entity type → CRUD entities with photos
- Manage: create item → EntitySelect per linked type → save → verify join table
- Edit item → change entity selections → verify
- Create update → attach entities → verify on UpdateTimeline
- DetailPanel → entities grouped by type with icons
- Delete entity → blocked if linked to items/updates
- Existing orgs with species → verify migration, no broken references

### Build
- `npm run type-check` passes
- `npm run build` passes
- `npm run test` passes
