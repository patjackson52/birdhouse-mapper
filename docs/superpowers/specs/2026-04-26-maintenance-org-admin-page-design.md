# Org-level Scheduled Maintenance admin page — design

**Date:** 2026-04-26
**Status:** approved (brainstorm complete)
**Builds on:** PR 1 (admin CRUD, `ea37d54`), PR 2 (real pickers, `a9d1896`), PR 3 (public viewer, `#283`)

---

## Goal

Add the missing org-level entry point for scheduled maintenance. Today the feature has no link in the org admin sidebar; the only sidebar entry lives on the property-domain admin (`PropertyAdminShell`). Reaching maintenance from the org admin requires drilling `/admin/properties` → pick property → property sidebar.

This spec adds:

1. A `Maintenance` link in `AdminShell` (org admin sidebar) pointing to a new `/admin/maintenance` page.
2. A new server-rendered list page at `/admin/maintenance` that aggregates projects across all of the org's active properties, grouped by property.
3. A shared list-view client component used by all three maintenance list routes (org aggregate, org-domain property scope, property-domain) so they look identical.

The design follows the bundled mockup at `Scheduled Maintenance.html`: stat strip + tabs + searchable list with the existing `MaintenanceProjectRow`.

---

## Routes

Three routes share one list-view component after this change:

| Route | Scope | Stats | List shape | "+ New project" |
|---|---|---|---|---|
| `/admin/maintenance` (NEW) | All active properties in the org | Org-wide rollups | Grouped by property when org has ≥2 active properties; flat for single-property orgs | Chooser modal when ≥2 properties; direct link when 1 |
| `/admin/properties/[slug]/maintenance` (refactored) | Single property | Property-scoped | Flat | Direct link to existing create form |
| `/p/[slug]/admin/maintenance` (refactored) | Single property | Property-scoped | Flat | Direct link to existing create form |

Detail page (`/admin/properties/[slug]/maintenance/[id]`) and create page (`/admin/properties/[slug]/maintenance/new`) are unchanged. Public viewer (`/p/[slug]/maintenance/[id]`) is unchanged.

---

## Data fetching

### Org page

Server component at `src/app/admin/maintenance/page.tsx`:

1. Read `tenant.orgId` from middleware-injected headers (`x-org-id`).
2. Fetch active, non-deleted properties:
   ```
   properties.select('id, name, slug').eq('org_id', orgId).eq('is_active', true).is('deleted_at', null).order('name')
   ```
3. Fetch all maintenance projects for the org via the existing list-row query (the one PR 1 added that returns `MaintenanceProjectRowData` with `items_completed`, `items_total`, `knowledge_count`, `creator_name`). Scope it by `property_id IN (...)` rather than a single `property_id`. If the existing helper takes a single property, lift the scope: pass an array, or call it once and merge — pick whichever needs less surgery.
4. Compute org-wide stats once (see Stats below).
5. Render `<MaintenanceListView mode="org" projects={...} properties={...} stats={...} />`.

### Property pages (refactored)

Both existing routes keep their current per-property fetch shape and now render `<MaintenanceListView mode="property" ... />` with `properties=[singleProperty]` and a `createHref` that points to the existing create form.

### Stats

Computed server-side from the fetched project list. Same definitions for org and property modes, just over a different scope:

- **`in_progress`** — count where `status === 'in_progress'`
- **`due_soon`** — count where `status === 'planned'` and `scheduled_for` is within the next 14 days
- **`overdue`** — count where `status === 'planned'` and `scheduled_for` is in the past
- **`completed_this_year`** — count where `status === 'completed'` and `updated_at` falls inside the current calendar year

`due_soon` and `overdue` use `scheduled_for IS NOT NULL` as a precondition; null-scheduled projects don't count toward either bucket.

---

## Shared list-view component

`src/components/maintenance/MaintenanceListView.tsx` (new, client component).

```ts
interface Props {
  mode: 'org' | 'property';
  projects: MaintenanceProjectRowData[];
  properties: { id: string; name: string; slug: string }[];
  stats: {
    in_progress: number;
    due_soon: number;
    overdue: number;
    completed_this_year: number;
  };
  /** Property-mode: where "+ New project" should link. Required when mode === 'property'. */
  createHref?: string;
  /** Detail-link builder. Project row → `/admin/properties/<slug>/maintenance/<id>`. */
  buildDetailHref: (project: MaintenanceProjectRowData) => string;
}
```

### Internal state

- `tab: 'active' | 'completed' | 'cancelled' | 'all'` (default `'active'`)
- `search: string` (debounced filter on project title)

### Layout

```
┌────────────────────────────────────────────────────────┐
│  MaintenanceStatStrip (4 cards)                        │
├────────────────────────────────────────────────────────┤
│  Card                                                  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [Active] [Completed] [Cancelled] [All]   🔍 ... │ │  ← tabs + search
│  ├──────────────────────────────────────────────────┤ │
│  │  Property header (org mode, ≥2 properties only)  │ │
│  │  ─ Project row                                   │ │
│  │  ─ Project row                                   │ │
│  │  Property header                                 │ │
│  │  ─ Project row                                   │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Grouping rules

- **`mode === 'property'`** OR **`mode === 'org' && properties.length === 1`**: flat list, no group headers.
- **`mode === 'org' && properties.length >= 2`**: group rows by `project.property_id`. Each group has a header showing the property name as a link to `/admin/properties/<slug>/maintenance`. Property order matches the `properties` prop order (alphabetical by name from the server query).
- **Empty groups** (a property with zero projects matching the current tab + search) are hidden entirely. No empty-state row per group.

### Empty state

If `filtered.length === 0` across the whole list:

- Show the existing empty-state pattern from the design (centered icon + heading + "+ New project" CTA).
- Wording adapts to the current tab — e.g. "No active projects", "No completed projects".

### "+ New project" button

Component name: `<NewProjectButton mode properties createHref />`.

- **Property mode** — render an `<a>` to `createHref` styled as `.btn-primary`. No modal.
- **Org mode + 1 active property** — render an `<a>` directly to `/admin/properties/<the-slug>/maintenance/new`. No modal.
- **Org mode + ≥2 active properties** — render a `<button>` that opens a small modal: a vertical list of properties (name + a short subtitle if present). Clicking a row routes to `/admin/properties/<slug>/maintenance/new`. The modal closes on Escape, on backdrop click, and on selection.

The modal is keyboard-accessible (focus trap on open, focus restored to the button on close) — reuse `useFocusTrap` from `src/components/maintenance/useFocusTrap.ts` (already in the repo per PR 1).

### Project row

Reuse `src/components/maintenance/MaintenanceProjectRow.tsx` (PR 1). Inspect it before implementing — if it already shows: title, status pill, scheduled date, item count, knowledge count, creator, progress bar (in_progress only), updated date, chevron — wire it as-is.

If it's missing the design's two row-level callouts, extend in place rather than fork:

- **Overdue chip** (`bg-red-100 text-red-800`) when `status === 'planned'` and `scheduled_for` is in the past.
- **"in N days" suffix** on the scheduled-date meta when `status === 'planned'` and `scheduled_for` is within the next 14 days.

Both callouts are derived from `scheduled_for` and `status` — no new data needed.

---

## Stat-strip component

`src/components/maintenance/MaintenanceStatStrip.tsx` (new). Pure presentational. Renders four cards in a `grid-cols-2 md:grid-cols-4` layout with the value, icon, tinted icon background, and label per the mockup:

| Stat | Icon | Tint | Foreground |
|---|---|---|---|
| In progress | `🔁` (or sibling lucide icon already in repo) | blue-100 | blue-800 |
| Due in 2 weeks | `⏰` | amber-100 | amber-800 |
| Overdue | `⚠️` | red-100 | red-800 |
| Completed this year | `✓` | green-100 | green-800 |

Use whichever icon source the repo already uses for admin chrome (heroicons, lucide-react, or inline SVG — match neighbors).

---

## Sidebar entry

`src/app/admin/AdminShell.tsx` `BASE_NAV_ITEMS` — add a single line in the **Data** section after `Geo Layers`:

```ts
{ label: 'Maintenance', href: '/admin/maintenance' },
```

No "highlight" / "new" badge — the design mockup's `highlight: true` is a review callout, not steady-state UX.

`PropertyAdminShell.tsx` already has its `Maintenance` link (`{base}/maintenance`) — no change.

---

## Files

**Create:**

```
src/app/admin/maintenance/page.tsx
src/app/admin/maintenance/loading.tsx
src/app/admin/maintenance/error.tsx

src/components/maintenance/MaintenanceListView.tsx
src/components/maintenance/MaintenanceStatStrip.tsx
src/components/maintenance/NewProjectButton.tsx

src/components/maintenance/__tests__/MaintenanceListView.test.tsx
src/components/maintenance/__tests__/MaintenanceStatStrip.test.tsx
src/components/maintenance/__tests__/NewProjectButton.test.tsx
```

**Modify:**

```
src/app/admin/AdminShell.tsx                            (+1 nav entry)
src/app/admin/properties/[slug]/maintenance/page.tsx    (use shared view)
src/app/p/[slug]/admin/maintenance/page.tsx             (use shared view)
src/components/maintenance/MaintenanceProjectRow.tsx    (only if missing overdue / in-N-days callouts)
e2e/tests/admin/maintenance.spec.ts                     (sidebar nav assertion)
```

**Delete (replaced):**

```
src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx    (if it exists; superseded by MaintenanceListView)
src/app/p/[slug]/admin/maintenance/MaintenanceListClient.tsx             (if it exists; superseded)
```

The two `MaintenanceListClient.tsx` files are inferred from PR 1's structure. The plan should grep the repo first and adjust if naming differs.

---

## Tests

**Vitest:**

- `MaintenanceListView`
  - Renders 4 stat cards with passed values.
  - Switches `tab` filter (Active default; clicking Completed filters; counts update).
  - Search box filters by title (case-insensitive substring).
  - `mode='org'` + 1 property: renders flat, no group header.
  - `mode='org'` + 2 properties: renders both group headers; group with no matching projects hidden.
  - `mode='org'` + group header is a link to `/admin/properties/<slug>/maintenance`.
  - Empty list: renders empty-state CTA with tab-aware wording.

- `MaintenanceStatStrip`
  - Renders all four cards with correct values.
  - Each card has the expected aria-label for screen readers.

- `NewProjectButton`
  - `mode='property'`: renders an `<a>` with the passed `createHref`. No button.
  - `mode='org'` + 1 property: renders an `<a>` to that property's `/admin/properties/<slug>/maintenance/new`.
  - `mode='org'` + 2 properties: renders a button; clicking opens a modal listing both properties; clicking a row in the modal navigates to the right URL.

**Playwright (`e2e/tests/admin/maintenance.spec.ts`):**

Extend the existing serial describe with a new first test that:

1. Signs in as admin, navigates to `/admin`.
2. Clicks the `Maintenance` sidebar link.
3. Waits for `/admin/maintenance`.
4. Asserts the page heading is visible (`heading "Scheduled Maintenance"`).
5. Asserts the four stat cards render.

The remainder of the suite (create / add item / delete / public viewer) keeps using the existing property-scoped flow — no churn.

---

## Out of scope

- No DB schema changes; no RLS changes. Existing org-membership policies on `maintenance_projects` already cover org-aggregate reads.
- No changes to the create form or detail page.
- No changes to the public viewer (`/p/[slug]/maintenance/[id]`) or the in-page block (`MaintenanceProjectsBlock`).
- No deletion of property-scoped routes — they remain at the same URLs and now share the list view.
- No "highlight new feature" badge on the sidebar entry.

---

## Open questions

None. All scope questions resolved during brainstorm:

1. Property column placement → group by property (with single-property flat fallback).
2. "+ New project" entry → single top-right button; auto-skip chooser when org has exactly one property.
3. Empty groups under current tab → hidden.
4. Property name in group header → linked to that property's admin maintenance page.
