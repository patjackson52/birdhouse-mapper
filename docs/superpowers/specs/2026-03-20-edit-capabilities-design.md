# Edit Capabilities Design

**Date:** 2026-03-20
**Status:** Approved

## Summary

Add item editing capabilities to the Birdhouse Mapper app. Currently items can only be created and deleted — this design introduces a full edit form, location history tracking, and edit affordances from both the detail panel and admin dashboard.

## Requirements

1. All authenticated users (editors + admins) can edit any item
2. Edit form is a pre-populated version of the add form at `/manage/edit/[id]`
3. Location changes are tracked in a `location_history` table (other fields are not history-tracked)
4. Admins can revert to a previous location from the history
5. Detail panel has an "Edit Item" button (action bar at bottom)
6. Admin dashboard item rows are clickable, navigating to the edit form

## Data Model

### New table: `location_history`

| Column       | Type                  | Notes                     |
|--------------|-----------------------|---------------------------|
| `id`         | uuid (PK)             | Default gen_random_uuid() |
| `item_id`    | uuid (FK → items)     | ON DELETE CASCADE         |
| `latitude`   | float8                | NOT NULL                  |
| `longitude`  | float8                | NOT NULL                  |
| `created_by` | uuid (FK → profiles)  | NOT NULL — who moved it   |
| `created_at` | timestamptz           | Default now()             |

### No changes to `items` table

The existing `latitude`/`longitude` columns on `items` remain the source of truth for current location. They are updated in place when location changes. `location_history` stores the audit trail.

### Migration: backfill existing items

The migration creates a `location_history` row for every existing item using its current lat/lng and `created_by`.

## Routes & Components

### New route: `/manage/edit/[id]`

- **Page** (`src/app/manage/edit/[id]/page.tsx`): Fetches item by ID with joins (item_type, custom_fields, species, photos). Redirects to `/manage` if not found.
- **Component** (`src/components/manage/EditItemForm.tsx`): Structurally similar to `ItemForm` but pre-populated, uses `update` instead of `insert`, button says "Save Changes".

### New component: `LocationHistory`

- `src/components/manage/LocationHistory.tsx`
- Vertical timeline style matching the existing `UpdateTimeline` pattern
- Green dot for current location, gray dots for past
- Each entry shows: coordinates, date, who moved it
- "Revert" button on past entries (admin only) — sets the LocationPicker coordinates but doesn't save until user clicks "Save Changes"
- Only rendered when user is admin

### Modified: `DetailPanel.tsx`

- Add action bar at the bottom of the panel content (above the Updates timeline)
- Two buttons: "Edit Item" (links to `/manage/edit/[id]`) and "Add Update" (links to `/manage/update?item=[id]`)
- Visible to all authenticated users. `DetailPanel` will receive an `isAuthenticated` prop to conditionally render the action bar. The parent page (`src/app/page.tsx`) will need to fetch session state and pass it down. Anonymous map viewers see no edit buttons.

### Modified: Admin Dashboard (`/admin/page.tsx`)

- Item table rows become clickable (whole row navigates to `/manage/edit/[id]`)
- Row name underlines on hover for affordance
- Delete button click stops propagation (doesn't trigger row navigation)

## Edit Form Behavior

### Loading

- Fetch item with: item_type, custom_fields (for the type), item_species → species, photos
- Pre-populate all form fields from fetched data
- If admin, also fetch `location_history` for the item

### Saving

1. **Core fields** (name, description, status, custom_field_values, item_type_id): direct `update` on `items` table. If `item_type_id` changes, `custom_field_values` is cleared and rebuilt from the new type's fields only — old type's values are discarded.
2. **Location change** (lat/lng differ from original values):
   - Insert new row into `location_history` with new coordinates and current user
   - Update `items.latitude` and `items.longitude`
3. **Species**: Diff against original — delete removed `item_species` rows, insert new ones
4. **Photos**:
   - Existing photos displayed with remove option
   - Removal deletes `photos` row and storage object (on save, not on click)
   - New photos uploaded and inserted as additions
5. **No location history record** created if lat/lng are unchanged

### Revert (admin only)

- "Revert" button on a location history entry sets the LocationPicker to those coordinates
- Does not save immediately — revert is applied when admin clicks "Save Changes"
- Saving after revert creates a new `location_history` entry (the revert itself is tracked)

## UI Decisions

- **Detail panel edit button**: Action bar at bottom of panel with "Edit Item" and "Add Update" buttons
- **Admin table interaction**: Whole row clickable, navigating to `/manage/edit/[id]`
- **Location history style**: Vertical timeline with dots, matching existing UpdateTimeline pattern
- **Edit route**: Shared `/manage/edit/[id]` for both editors and admins (no separate admin route)

## Error Handling & Edge Cases

- **Concurrent edits**: Last write wins. No optimistic locking — small-team app where conflicts are unlikely.
- **Deleted item type**: Save fails gracefully with error message if the item's type was deleted between load and save.
- **Photo removal**: Deletion of photos row + storage object happens on save, not on click. Cancel preserves photos.
- **Navigation guard**: None for v1. Can be added later if needed.

## Permissions

- All authenticated users (editors + admins) can edit any item via `/manage/edit/[id]`
- Location history is visible and revertable by admins only
- Auth is enforced server-side in middleware (`src/middleware.ts`), which checks the user session for `/manage/*` routes and redirects unauthenticated users to `/login`. The new `/manage/edit/[id]` route inherits this protection automatically.

## New TypeScript types

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

Add to `Database` interface in `types.ts`:
```typescript
location_history: {
  Row: LocationHistory;
  Insert: Omit<LocationHistory, 'id' | 'created_at'>;
  Update: Partial<Omit<LocationHistory, 'id' | 'created_at'>>;
  Relationships: [];
};
```
