# Type & Species Management Design

## Overview

Add admin UI for managing item types (with custom fields and update types) and species. Currently these are only configurable via SQL migrations. This feature gives admins full CRUD control through the web interface.

## Data Model

### New Tables

#### `species`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | text | NOT NULL, UNIQUE | Common name, e.g., "Black-capped Chickadee" |
| scientific_name | text | nullable, UNIQUE (when non-null) | e.g., *Poecile atricapillus* |
| description | text | nullable | Habitat/behavior notes |
| photo_path | text | nullable | Supabase Storage path (prefix: `species/{id}/`) |
| conservation_status | text | nullable | e.g., "Least Concern", "Endangered" |
| category | text | nullable | e.g., "Songbirds", "Raptors" |
| external_link | text | nullable | URL to external reference (Audubon, eBird, etc.) |
| sort_order | int | NOT NULL, default 0 | Display ordering |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | Updated via trigger (same pattern as `items` table) |

#### `item_species` (join table)

| Column | Type | Constraints |
|--------|------|-------------|
| item_id | UUID | FK → items ON DELETE CASCADE |
| species_id | UUID | FK → species ON DELETE RESTRICT |
| PK | | (item_id, species_id) |

#### `update_species` (join table)

| Column | Type | Constraints |
|--------|------|-------------|
| update_id | UUID | FK → item_updates ON DELETE CASCADE |
| species_id | UUID | FK → species ON DELETE RESTRICT |
| PK | | (update_id, species_id) |

### Storage Path Convention

Species photos use the existing `item-photos` bucket with a distinct prefix to avoid collisions:
- Pattern: `species/{species_id}/{timestamp}.{ext}`
- Example: `species/a1b2c3d4/1710720000000.jpg`

### Existing Tables (no changes)

- `item_types` - already has id, name, icon, color, sort_order, created_at
- `custom_fields` - already has id, item_type_id, name, field_type, options, required, sort_order
- `update_types` - already has id, name, icon, is_global, item_type_id, sort_order

### Deletion Behavior

All deletion checks are **application-level pre-checks** (count associations, show friendly message) rather than relying on catching raw FK violation errors from Supabase.

- **Item types**: count items with this type first. If count > 0, show: "Cannot delete: N items use this type." If 0, confirm and delete (custom fields and update types cascade via existing FKs).
- **Species**: count `item_species` and `update_species` rows first. If referenced, show: "Cannot delete: this species is associated with N items and M observations." If unreferenced, confirm and delete.
- **Custom fields**: individual field deletion is always allowed (existing `custom_field_values` JSON keys become orphaned but harmless).
- **Update types**: count `item_updates` with this `update_type_id` first. If count > 0, show: "Cannot delete: N observations use this update type." If 0, confirm and delete.

### TypeScript Types

Add to `src/lib/types.ts`:

```typescript
export interface Species {
  id: string;
  name: string;
  scientific_name: string | null;
  description: string | null;
  photo_path: string | null;
  conservation_status: string | null;
  category: string | null;
  external_link: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemSpecies {
  item_id: string;
  species_id: string;
}

export interface UpdateSpecies {
  update_id: string;
  species_id: string;
}
```

Extend `ItemWithDetails`:
```typescript
export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[]; species: Species[] })[];
  photos: Photo[];
  custom_fields: CustomField[];
  species: Species[];  // species associated with this item
}
```

Add `species`, `item_species`, and `update_species` entries to the `Database` interface following the existing pattern.

### Migration

Single additive migration: `003_species_and_types.sql`

- Creates `species`, `item_species`, `update_species` tables
- Creates `updated_at` trigger on `species` (reuse existing trigger function from `items` table)
- RLS policies matching existing patterns:
  - Public read access (SELECT) for all three tables
  - Authenticated write access (INSERT, UPDATE, DELETE) for `species` — any authenticated user (matches existing pattern; admin-only enforcement is handled by the admin page routing, not RLS)
  - Authenticated write access (INSERT, DELETE) for `item_species` and `update_species` — any authenticated user (same pattern as `items` and `item_updates` tables)

## Admin Pages

### `/admin/types` - Item Type Management

**Layout**: Full-page list of item types, each as an expandable card.

**Loading state**: `LoadingSpinner` component while fetching (matches existing admin pattern).

**Empty state**: "No item types configured yet. Add your first item type to get started." with prominent add button.

**List view** (collapsed state per type):
- Icon + name + color swatch + item count badge
- Edit / Delete buttons
- Sort order up/down arrow buttons

**Expanded state** (click to expand a type):
- Editable fields: name, icon (text/emoji input), color (color picker input), sort order
- **Custom Fields section**: table of fields for this type
  - Each row: name, field_type, required checkbox, sort order, options (for dropdowns), edit/delete buttons
  - "Add Custom Field" button at bottom
  - Inline editing for add/edit
  - Dropdown options edited as a dynamic list of text inputs (add/remove individual options)
- **Update Types section**: table of type-specific update types
  - Each row: icon, name, sort order, edit/delete buttons
  - Global update types shown in a separate read-only list for reference
  - "Add Update Type" button for type-specific ones

**Add new type**: button at top of page, opens empty expanded card.

**Delete**: application-level pre-check (see Deletion Behavior above).

### `/admin/species` - Species Management

**Layout**: Card grid of species with search/filter.

**Loading state**: `LoadingSpinner` while fetching.

**Empty state**: "No species added yet. Add your first species to start tracking wildlife." with prominent add button.

**Search/filter**:
- Text search across name and scientific name
- Filter by category (dropdown of distinct categories)
- Filter by conservation status (dropdown of distinct statuses)

**Card display**:
- Photo thumbnail (or placeholder icon)
- Common name + scientific name (italic)
- Category badge + conservation status badge
- Edit / Delete buttons

**Add/Edit form** (inline section at top of page, toggled by Add/Edit buttons):
- Name (required)
- Scientific name
- Description (textarea)
- Photo upload: simple single-file input with preview. Shows existing photo in edit mode with option to replace. Does NOT reuse PhotoUploader (which is designed for multi-photo append workflows). Instead, a simpler single-photo component inline in SpeciesForm.
- Conservation status (text input)
- Category (text input)
- External link (URL input)
- Sort order

**Delete**: application-level pre-check (see Deletion Behavior above).

### Admin Navigation

Add "Types" and "Species" links to the admin layout top navigation bar (alongside existing "Data" and "Settings" links). This ensures they're always accessible from any admin page.

## Updates to Existing UI

### ItemForm (`/manage/add`)

- Add a **species multi-select** after the existing fields
- Shows all species from the species table
- Selected species are saved to `item_species` join table after item creation
- Optional — not required to create an item

### UpdateForm (`/manage/update`)

- Add a **species multi-select** for recording species observed
- Selected species are saved to `update_species` join table after update creation
- Optional — not required to create an update

### DetailPanel (`/components/item/DetailPanel.tsx`)

- Show associated species below item details (small badges or chips with species name)
- In the update timeline, show species recorded per observation
- Species data fetched as part of the `ItemWithDetails` query via join tables

### SpeciesSelect Component

New reusable `src/components/manage/SpeciesSelect.tsx`:
- Multi-select chip selector (click to toggle, selected shown as removable chips)
- Fetches species list from Supabase on mount
- Returns array of selected species IDs
- Used by both ItemForm and UpdateForm

### Query Pattern for ItemWithDetails

Fetching species for an item requires separate queries through join tables (Supabase JS client doesn't support many-to-many joins directly):

```typescript
// After fetching item, fetch associated species
const { data: itemSpecies } = await supabase
  .from('item_species')
  .select('species_id, species(*)')
  .eq('item_id', itemId);

// For updates, fetch species per update
const { data: updateSpecies } = await supabase
  .from('update_species')
  .select('update_id, species_id, species(*)')
  .in('update_id', updateIds);
```

After data changes on admin pages, `router.refresh()` is sufficient to invalidate server-side caches. Client components that fetch their own data (ItemForm, UpdateForm) re-fetch on mount, so no additional cache invalidation is needed.

## File Structure

```
src/app/admin/
├── types/
│   └── page.tsx              # Item type management page
├── species/
│   └── page.tsx              # Species management page

src/components/admin/
├── ItemTypeEditor.tsx        # Single item type expandable card
├── CustomFieldEditor.tsx     # Custom field list + inline CRUD within a type
├── UpdateTypeEditor.tsx      # Update type list + inline CRUD within a type
├── SpeciesForm.tsx           # Add/edit species form with single-photo upload
├── SpeciesCard.tsx           # Species display card for the grid

src/components/manage/
├── SpeciesSelect.tsx         # Multi-select species picker (shared)

supabase/migrations/
├── 003_species_and_types.sql # New migration
```

## Technical Patterns

- **Supabase client calls** directly from client components (same pattern as admin dashboard)
- **React useState** for form state management
- **Simple single-photo upload** for species (not reusing PhotoUploader which is multi-photo)
- **Existing admin layout** and styling patterns followed
- **RLS policies** handle authorization at the database level; admin page routing handles role-based access at the UI level
- **TypeScript types** added to `src/lib/types.ts`: `Species`, `ItemSpecies`, `UpdateSpecies` interfaces, plus `Database` and `ItemWithDetails` extensions
- **Error handling**: try/catch with user-facing error messages, matching existing patterns
- **Sort order**: up/down arrow buttons (no drag-and-drop library needed)

## Out of Scope

- Bulk import/export of species or types
- Species taxonomy hierarchy
- Auto-complete from external species databases
- Drag-and-drop sort ordering
- Species photos in a separate storage bucket (reuse existing item-photos bucket with `species/` prefix)
