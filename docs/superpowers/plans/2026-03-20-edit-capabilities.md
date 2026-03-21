# Edit Capabilities Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add item editing with location history tracking, edit affordances from detail panel and admin dashboard.

**Architecture:** New `/manage/edit/[id]` route with `EditItemForm` component (structurally based on existing `ItemForm`). New `location_history` table tracks location changes as an audit trail. `DetailPanel` gets an action bar for authenticated users. Admin dashboard item rows become clickable links to the edit form.

**Tech Stack:** Next.js 14 (App Router), React 18, Supabase (PostgreSQL + Storage), TypeScript, Tailwind CSS, Leaflet

**Spec:** `docs/superpowers/specs/2026-03-20-edit-capabilities-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/005_location_history.sql` | New table + RLS + backfill |
| Modify | `src/lib/types.ts` | Add `LocationHistory` type + Database entry |
| Create | `src/app/manage/edit/[id]/page.tsx` | Edit route page |
| Create | `src/components/manage/EditItemForm.tsx` | Pre-populated edit form |
| Create | `src/components/manage/LocationHistory.tsx` | Timeline of location changes (admin only) |
| Modify | `src/components/item/DetailPanel.tsx` | Add action bar with Edit/Update buttons |
| Modify | `src/app/page.tsx` | Pass `isAuthenticated` to DetailPanel |
| Modify | `src/app/admin/page.tsx` | Clickable item rows → edit route |

---

## Chunk 1: Database & Types

### Task 1: Create location_history migration

**Files:**
- Create: `supabase/migrations/005_location_history.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 005_location_history.sql — Location history for audit trail

create table location_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  latitude float8 not null,
  longitude float8 not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_location_history_item on location_history(item_id);
create index idx_location_history_created on location_history(created_at desc);

-- RLS: append-only audit log (no update/delete policies)
alter table location_history enable row level security;

-- Public can view location history
create policy "Public can view location history"
  on location_history for select
  to anon, authenticated
  using (true);

-- Authenticated users can insert location history
create policy "Authenticated users can insert location history"
  on location_history for insert
  to authenticated
  with check (true);

-- Backfill: create initial location_history row for every existing item
-- Only backfill items that have a created_by value (skip any without)
insert into location_history (item_id, latitude, longitude, created_by)
select id, latitude, longitude, created_by
from items
where created_by is not null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/005_location_history.sql
git commit -m "feat: add location_history migration with RLS and backfill"
```

### Task 2: Add LocationHistory type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the LocationHistory interface**

Add after the `UpdateSpecies` interface and before the `// Composite types` section:

```typescript
export interface LocationHistory {
  id: string;
  item_id: string;
  latitude: number;
  longitude: number;
  created_by: string;
  created_at: string;
}
```

- [ ] **Step 2: Add to Database interface**

In the `Tables` section of the `Database` interface, add:

```typescript
location_history: {
  Row: LocationHistory;
  Insert: Omit<LocationHistory, 'id' | 'created_at'>;
  Update: never;
  Relationships: [];
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add LocationHistory type and Database entry"
```

---

## Chunk 2: Edit Form & Route

### Task 3: Create EditItemForm component

**Files:**
- Create: `src/components/manage/EditItemForm.tsx`

This component is structurally based on `ItemForm` (`src/components/manage/ItemForm.tsx`) but pre-populates fields from an existing item and uses `update` instead of `insert`.

- [ ] **Step 1: Create the EditItemForm component**

The component receives props for the item data to pre-populate:

```typescript
interface EditItemFormProps {
  itemId: string;
  initialData: {
    name: string;
    description: string | null;
    latitude: number;
    longitude: number;
    status: ItemStatus;
    item_type_id: string;
    custom_field_values: Record<string, unknown>;
  };
  initialSpeciesIds: string[];
  initialPhotos: Photo[];
  isAdmin: boolean;
}
```

Key differences from `ItemForm`:
- **Must use `dynamic(() => import('./LocationPicker'), { ssr: false })` for Leaflet** — same SSR-disabled import pattern as `ItemForm`
- State initialized from `initialData` props instead of empty defaults
- `selectedTypeId` initialized from `initialData.item_type_id`
- `customFieldValues` initialized from `initialData.custom_field_values` (cast values to strings for form inputs)
- Tracks `originalLatitude` and `originalLongitude` (from `initialData`) to detect location changes
- Submit handler wrapped in try/catch (same pattern as `ItemForm`):
  - Get current user via `supabase.auth.getUser()` — if null, set error and return
  - Uses `supabase.from('items').update({...}).eq('id', itemId)` instead of `.insert()`
  - If lat/lng differ from original: also inserts into `location_history` with new coordinates and current user ID
  - If `item_type_id` changed: clears `custom_field_values` to only include new type's fields
  - Species: deletes all existing `item_species` rows for this item, then inserts the current selection (simplified from spec's diff approach — functionally equivalent for this junction table)
  - Photos marked for removal: deletes `photos` rows and storage objects via `supabase.storage.from('item-photos').remove([path])`
  - New photos: uploads and inserts as in `ItemForm`
  - If any step throws, catch block sets `setError(err.message)` and `setSaving(false)` — partial saves are acceptable (same as ItemForm's approach)
- **Photo `is_primary` logic**: When existing photos are removed, if the primary photo is among them, mark the first remaining existing photo as primary. If no existing photos remain, the first new upload gets `is_primary: true`. Otherwise new uploads get `is_primary: false`.
- Button text: "Save Changes" (disabled state: "Saving...")
- After save: `router.push('/manage')` + `router.refresh()`
- Shows existing photos with remove toggle (track `photosToRemove: string[]` state)
- If `isAdmin`, renders `LocationHistory` component below the LocationPicker

The form JSX structure is identical to `ItemForm` (same field order, same class names, same validation), except:
- Item type selector is always shown (even with 1 type) since the type might need changing
- Existing photos section above the PhotoUploader showing current photos with remove buttons
- LocationHistory component rendered conditionally after LocationPicker when `isAdmin` is true

- [ ] **Step 2: Commit**

```bash
git add src/components/manage/EditItemForm.tsx
git commit -m "feat: add EditItemForm component for editing existing items"
```

### Task 4: Create LocationHistory component

**Files:**
- Create: `src/components/manage/LocationHistory.tsx`

- [ ] **Step 1: Create the LocationHistory component**

```typescript
interface LocationHistoryProps {
  itemId: string;
  onRevert: (latitude: number, longitude: number) => void;
}
```

The component:
- Fetches `location_history` rows for the item, ordered by `created_at desc`
- Also fetches `profiles` to resolve `created_by` → `display_name`
- Renders a vertical timeline matching the `UpdateTimeline` pattern (`src/components/item/UpdateTimeline.tsx`):
  - Uses `pl-8` container with `relative` positioning
  - Timeline line: `absolute left-3 top-8 bottom-0 w-px bg-sage-light` (between items)
  - Timeline dot: `absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full` — green (`bg-forest`) for the first (current) entry, gray (`bg-sage-light`) for past entries (matches `UpdateTimeline` dot sizing)
  - Each entry shows:
    - Coordinates as `latitude.toFixed(4), longitude.toFixed(4)`
    - Date via `formatShortDate(entry.created_at)`
    - Display name of who moved it
    - First entry: small "Current" badge (`text-xs bg-forest/10 text-forest px-1.5 py-0.5 rounded-full`)
    - Other entries: "Revert" button (`btn-secondary text-xs py-1`) that calls `onRevert(entry.latitude, entry.longitude)`
- If only 1 history entry (original location, no moves), show nothing (no history to display)

- [ ] **Step 2: Commit**

```bash
git add src/components/manage/LocationHistory.tsx
git commit -m "feat: add LocationHistory timeline component"
```

### Task 5: Create edit route page

**Files:**
- Create: `src/app/manage/edit/[id]/page.tsx`

- [ ] **Step 1: Create the page component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import EditItemForm from '@/components/manage/EditItemForm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { Photo } from '@/lib/types';
```

The page:
- Gets `id` from `useParams()`
- First checks auth: `const { data: { user } } = await supabase.auth.getUser()` — if `!user`, `router.push('/login')` and return
- Then fetches in parallel (single `Promise.all`):
  - Item: `supabase.from('items').select('*').eq('id', id).single()`
  - Item species: `supabase.from('item_species').select('species_id').eq('item_id', id)`
  - Item photos: `supabase.from('photos').select('*').eq('item_id', id)`
  - User profile: `supabase.from('profiles').select('role').eq('id', user.id).single()`
- If item not found or error: `router.push('/manage')`
- Renders `EditItemForm` with the fetched data
- Loading state shows `LoadingSpinner`
- Page title: "Edit Item"
- Same layout wrapper as add page: `max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6`

- [ ] **Step 2: Commit**

```bash
git add src/app/manage/edit/\[id\]/page.tsx
git commit -m "feat: add /manage/edit/[id] route page"
```

- [ ] **Step 3: Manually test the edit form**

1. Run `npm run dev`
2. Navigate to `/manage/edit/<some-item-id>` (get an ID from the admin dashboard or browser dev tools)
3. Verify:
   - Form loads with pre-populated data
   - All fields are editable
   - Changing location and saving creates a location_history entry
   - Species changes are saved correctly
   - "Save Changes" button works
   - Cancel navigates back

---

## Chunk 3: UI Affordances

### Task 6: Add action bar to DetailPanel

**Files:**
- Modify: `src/components/item/DetailPanel.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add isAuthenticated prop to DetailPanel**

In `src/components/item/DetailPanel.tsx`, update the interface:

```typescript
interface DetailPanelProps {
  item: ItemWithDetails | null;
  onClose: () => void;
  isAuthenticated?: boolean;
}
```

Update the function signature to destructure `isAuthenticated`:

```typescript
export default function DetailPanel({ item, onClose, isAuthenticated }: DetailPanelProps) {
```

- [ ] **Step 2: Add the action bar**

In the `content` JSX, insert an action bar **before** the Updates section (before the `<div>` containing `<h3>Updates</h3>`). Add `import Link from 'next/link';` at the top.

```tsx
{/* Action bar for authenticated users */}
{isAuthenticated && (
  <div className="flex gap-2 mb-4">
    <Link
      href={`/manage/edit/${item.id}`}
      className="btn-primary text-sm flex-1 text-center"
    >
      Edit Item
    </Link>
    <Link
      href={`/manage/update?item=${item.id}`}
      className="btn-secondary text-sm flex-1 text-center"
    >
      Add Update
    </Link>
  </div>
)}
```

- [ ] **Step 3: Pass isAuthenticated from page.tsx**

In `src/app/page.tsx`, in the `HomePageContent` component:

Add state:
```typescript
const [isAuthenticated, setIsAuthenticated] = useState(false);
```

In the existing `fetchData` useEffect, add `getUser()` to the existing `Promise.all` for parallel fetching:
```typescript
const [itemRes, typeRes, fieldRes, userRes] = await Promise.all([
  supabase.from("items").select("*").neq("status", "removed").order("created_at", { ascending: true }),
  supabase.from("item_types").select("*").order("sort_order", { ascending: true }),
  supabase.from("custom_fields").select("*").order("sort_order", { ascending: true }),
  supabase.auth.getUser(),
]);
// ... existing setItems/setItemTypes/setCustomFields ...
setIsAuthenticated(!!userRes.data.user);
```

Update the DetailPanel usage:
```tsx
<DetailPanel
  item={selectedItem}
  onClose={() => setSelectedItem(null)}
  isAuthenticated={isAuthenticated}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/item/DetailPanel.tsx src/app/page.tsx
git commit -m "feat: add Edit Item and Add Update action bar to detail panel"
```

### Task 7: Make admin dashboard item rows clickable

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add router import**

Add `useRouter` to the existing `next/navigation` import (if not already there). Also add:
```typescript
const router = useRouter();
```
in the component body.

- [ ] **Step 2: Make item rows clickable**

In the Items tab table body, update each `<tr>`:

```tsx
<tr
  key={item.id}
  className="hover:bg-sage-light cursor-pointer"
  onClick={() => router.push(`/manage/edit/${item.id}`)}
>
  <td className="px-4 py-3 text-sm font-medium text-forest-dark hover:underline hover:decoration-forest">
    {item.name}
  </td>
  <td className="px-4 py-3">
    <StatusBadge status={item.status} />
  </td>
  <td className="px-4 py-3 text-right">
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleDeleteItem(item.id);
      }}
      className="text-xs text-red-600 hover:text-red-800 transition-colors"
    >
      Delete
    </button>
  </td>
</tr>
```

Key changes:
- `cursor-pointer` on the row
- `onClick` on `<tr>` navigates to edit
- `hover:underline hover:decoration-forest` on the name cell
- `e.stopPropagation()` on the Delete button to prevent row click

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: make admin dashboard item rows clickable for editing"
```

- [ ] **Step 4: Manual end-to-end test**

1. Run `npm run dev`
2. Test detail panel:
   - Open the map, click a marker to open the detail panel
   - If logged in: verify "Edit Item" and "Add Update" buttons appear
   - If logged out: verify buttons do NOT appear
   - Click "Edit Item" → should navigate to `/manage/edit/[id]`
3. Test admin dashboard:
   - Navigate to `/admin`
   - Click an item row → should navigate to `/manage/edit/[id]`
   - Click "Delete" → should show confirmation, NOT navigate
4. Test edit form:
   - Change the name, save → verify name updated
   - Change the location, save → verify location updated and history entry created
   - As admin, verify location history timeline appears
   - Click "Revert" on a history entry → verify LocationPicker updates
   - Save after revert → verify new history entry created
   - Change species, save → verify species updated
   - Cancel → verify no changes saved
