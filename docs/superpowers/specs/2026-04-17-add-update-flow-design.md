# Add Update Flow — Design

**Date:** 2026-04-17
**Branch:** `fix/updates`
**Status:** Approved for implementation planning

## Problem

Tapping "Add Update" on an item in field mode lands the user on `/p/[slug]/activity`, a stub page that reads "Recent activity will appear here." with no way forward. Users cannot add updates from the public field-mode shell at all.

**Root cause:** The IA redesign added a middleware rewrite (`src/lib/supabase/middleware.ts:342`) mapping `/manage/update` → `/p/${slug}/activity`, but the destination was never implemented. The fully functional `UpdateForm` at `/manage/update` is orphaned — unreachable in the field-mode routes.

## Goal

Let authenticated users add an update to a specific item from the public field-mode shell, supporting the org's configured update types (species sightings, maintenance, photos, status reports, and any admin-defined custom types). Reuse the existing `UpdateForm` rather than rebuild it.

**Out of scope:**

- A property-wide activity feed (the `/p/[slug]/activity` Activity tab stays stubbed; fixing that feed is a separate future spec).
- Redesigning `UpdateForm`, `PhotoUploader`, `SpeciesPicker`, or `update_types` schema.
- Admin configuration of which update types are "first-class" shortcuts — the picker is purely data-driven and renders whatever types exist.
- A standalone "add update without an item" entry point.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Flow shape | Type picker first → form | Friendlier on mobile, each type's existing custom fields render naturally in the form that follows. |
| Picker contents | Data-driven from `update_types` | Zero new schema; admins already control names, icons, and per-type fields. Seeded defaults ("Observation," "Maintenance," "Bird Sighting," etc.) appear automatically. |
| Tailoring depth | Light | No per-type hand-crafted UIs. Picker just pre-selects the type; existing `UpdateForm` handles everything downstream. |
| Post-submit destination | Back to item detail | Closes the loop — user returns to the same item, sees their new update in `UpdateTimeline`. |
| Activity tab | Untouched | Still stubbed; rewriting it is a separate scope. |

## Architecture

### Routes

Two new routes under the field-mode shell:

| Route | Purpose |
|---|---|
| `/p/[slug]/update/[itemId]` | Type picker. Renders item context header and one card per available `update_type`. |
| `/p/[slug]/update/[itemId]/[typeId]` | Form wrapper. Renders `<UpdateForm />` with item and type locked. |

### Middleware rewrite

Replace `src/lib/supabase/middleware.ts:342`:

```
'/manage/update': `/p/${defaultPropSlug}/activity`
```

with query-param-aware logic:

- `/manage/update?item=X` → `/p/${slug}/update/X` (picker) — 308 redirect
- `/manage/update` (no item query) → `/p/${slug}` — 308 redirect

The rewrite exists to catch stale links, external bookmarks, and any call sites we miss; authoritative entry points (`ActionButtonsBlock`, `DetailPanel`) link directly to the new path.

### Entry points

Two call sites currently link to `/manage/update?item=X` and must be updated to the new tenant-scoped path:

- `src/components/layout/blocks/ActionButtonsBlock.tsx` (configurable layout block; line ~30)
- `src/components/item/DetailPanel.tsx` (default layout fallback; line ~196)

Both need the tenant slug. `DetailPanel` already runs inside the `/p/[slug]/*` shell and can derive the slug via the same `useConfig()` hook the form uses. `ActionButtonsBlock` is rendered below `DetailPanel` in the layout renderer; the slug is threaded through as a prop.

## Components

### New

1. **`src/app/p/[slug]/update/[itemId]/page.tsx`** — type picker (server component).
   - Fetches the item (404 if missing or wrong tenant).
   - Fetches update types matching `org_id = tenant.orgId AND (is_global = true OR item_type_id = <item's item_type_id>)`.
   - Filters by per-type create permission via `canPerformUpdateTypeAction` (existing helper in `src/lib/permissions/resolve.ts`).
   - Branches on the filtered count:
     - `0` → empty state: "No update types configured." Admin users see a link to the admin update-type editor.
     - `1` → server-side `redirect(308, …/[typeId])` (user never sees the picker).
     - `>1` → renders a client component with a card per type.
   - Client component: icon (`IconRenderer`) + name, `Link` to `[typeId]` route. Minimal styling consistent with other `/p/[slug]/*` pages.

2. **`src/app/p/[slug]/update/[itemId]/[typeId]/page.tsx`** — form wrapper (server component).
   - Re-validates item and type (404 on mismatch).
   - Re-checks create permission (403 → redirect back to picker).
   - Renders `<UpdateForm />`. Item and type are supplied via URL; the form reads them from route context.

### Touched

3. **`src/components/manage/UpdateForm.tsx`**
   - Already reads `?item=` from `useSearchParams` and locks the item control. Add two new props: `initialTypeId?: string` and `lockType?: boolean`. When `lockType` is true, pre-select the type and disable the type `<select>`. The form wrapper page (component #2) supplies these from route params; other call sites that don't supply them keep current behavior.
   - Change the post-save redirect. Current behavior: `router.push('/manage')` (middleware rewrites to `/p/[slug]`, losing item context). New: when locked to an item, `router.push('/p/${slug}?item=${itemId}')`. Slug comes from `useConfig()`. The root page already forwards `?item=X` to `/map?item=X`, which opens the detail panel for that item.

4. **`src/lib/supabase/middleware.ts`** — replace the line 342 mapping with the query-aware rewrite described above. No other middleware changes.

5. **`src/components/layout/blocks/ActionButtonsBlock.tsx`** — rewrite `addUpdateHref` to `/p/${propertySlug}/update/${itemId}`. The block is a client component; read `propertySlug` from `useConfig()` directly rather than threading a new prop through `LayoutRendererV2`. The unauthenticated `/login?redirect=…` wrapping stays; only the inner URL changes.

6. **`src/components/item/DetailPanel.tsx`** — rewrite the default-layout "Add Update" link (line ~196) to `/p/${propertySlug}/update/${item.id}`. `DetailPanel` is a client component running inside the `/p/[slug]/*` shell; `propertySlug` comes from `useConfig()`.

### Untouched

- `update_types`, `update_type_fields` schemas and seeds.
- `PhotoUploader`, `SpeciesPicker`, `EntitySelect`, `DynamicFieldRenderer`.
- Offline queue (`enqueueMutation`, `storePhotoBlob`).
- RBAC (`canPerformUpdateTypeAction`, `usePermissions`).
- `UpdateTimeline` (new updates appear there via existing data flow).
- `/p/[slug]/activity` stub and the Activity bottom-nav tab.

## Data Flow

Authenticated field user on mobile, slug `oak-meadow`, item `42`, picking the "Maintenance" update type:

1. On `/p/oak-meadow` (map), user taps marker for item 42 → `DetailPanel` opens with "Add Update" button.
2. Tap "Add Update" → navigate to `/p/oak-meadow/update/42`.
3. Picker page fetches item, update types, permissions. Filtered count ≥ 2 → renders cards.
4. Tap "Maintenance" card → navigate to `/p/oak-meadow/update/42/<maint-type-id>`.
5. Form page renders `UpdateForm` with item and type both locked. `update_type_fields` for the type are fetched (existing behavior); `DynamicFieldRenderer` shows them.
6. User fills notes, attaches a photo, submits. Online path: insert into `item_updates`, upload photos, upsert `update_entities` (existing). Offline path: `enqueueMutation` + `storePhotoBlob` (existing).
7. Success → `router.push('/p/oak-meadow?item=42')`. Root page forwards `?item=42` to `/map?item=42`; map opens the detail panel, which reloads and now shows the new entry in `UpdateTimeline`.

## Edge Cases

| Case | Behavior |
|---|---|
| Invalid `[itemId]` (not found, wrong tenant) | 404 from picker page. |
| Invalid `[typeId]` (not found, wrong org, doesn't apply to this item's type) | 404 from form page. |
| User lacks create permission for a type | Card hidden in picker; direct URL returns 403 and redirects to picker with error banner. |
| Zero eligible update types | Picker renders empty state with admin link (if admin). |
| Exactly one eligible update type | Picker server-redirects (308) to the form; user never sees the picker screen. |
| Stale `/manage/update?item=X` link | Middleware rewrites to `/p/[slug]/update/X` (308). |
| `/manage/update` with no item query | Middleware redirects to `/p/[slug]` home. |
| Unauthenticated user clicks "Add Update" | Existing wrapper sends them to `/login?redirect=<new-path>`; after login, they resume at the picker. |
| Offline submit | Existing offline queue handles it; post-submit redirect still works. |
| Duplicate / concurrent submit | Existing `saving` state in `UpdateForm` prevents it. |

## Testing

### Unit (Vitest + @testing-library/react)

- `UpdateForm`: add a test for type-lock — pre-selected, disabled, matches the URL param. Existing item-lock test stays.
- `UpdateForm`: post-save redirect test — when locked to an item, redirect targets `/p/[slug]?item=[itemId]`.
- `ActionButtonsBlock`: update the existing "links Add Update to /manage/update when authenticated" test to assert the new `/p/[slug]/update/[itemId]` href. Update related snapshot/unit tests in `LayoutRenderer.test.tsx`, `LayoutRendererV2.test.tsx` as needed.
- New test for the picker client component: renders N cards given N update_types, handles zero-state, handles single-type redirect.

### Integration

- Middleware test: `/manage/update?item=X` → `/p/[slug]/update/X`.
- Middleware test: `/manage/update` (no item) → `/p/[slug]`.
- Permission: picker filters out update_types the user can't create.

### E2E (Playwright smoke)

Single test covering the happy path:

1. Sign in, open `/p/[slug]`, click a marker.
2. Tap "Add Update" in the detail panel.
3. Picker appears; tap a type card.
4. Form appears with type locked; fill notes, submit.
5. Land back on the map with the item's detail panel open.
6. New update is visible in `UpdateTimeline`.

Visual snapshot the picker page per `docs/playbooks/visual-diff-screenshots.md`; attach before/after to the PR.

### Manual

`npm run dev`, exercise mobile (bottom sheet) and desktop (side panel). Confirm Activity tab still renders as a stub (no regression).

## Implementation Notes (non-normative)

- The "toast on success" detail is nice-to-have. If the codebase has an established toast utility, use it; otherwise skip toast rather than introduce a new pattern in this scope.
- `AGENTS.md` memory policy: if implementation uncovers a non-obvious architectural decision worth remembering, drop an ADR under `docs/adr/` via `scripts/new-adr.sh`.
