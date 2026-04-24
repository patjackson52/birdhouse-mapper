# Scheduled Maintenance — Design Spec (PR 1)

**Date:** 2026-04-23
**Branch:** `chore/scheduled-maintenance`
**Source design bundle:** `fieldmapper-scheduled-maintenance` (Claude Design handoff)

## Overview

FieldMapper needs a way for conservation staff to plan, coordinate, and track maintenance work across the items on a property. A maintenance project is a named effort (e.g. "Clean birdhouses in preparation for spring") with a scheduled date, a set of linked map items, optional supporting knowledge articles, and per-item completion tracking.

The full design (from the handoff bundle) covers admin CRUD, pickers, a public viewer, mobile overlays, and an item-detail card. This spec covers **PR 1 — the data layer and the admin CRUD surface**. Two follow-on PRs are scoped separately:

- **PR 2** — Replace interim pickers with the designed item picker (list + filter chips) and knowledge linker modal.
- **PR 3** — Add the public viewer at `/p/[slug]/maintenance/[id]` and the inline `MaintenanceProjectsCard` on item detail pages.

Nothing in PR 1 should block PR 2 or PR 3 from slotting in cleanly.

## Goals

- Staff+ can create, edit, and delete maintenance projects scoped to one property.
- Projects can link map items (from that property) and knowledge articles (from the org).
- Each linked item tracks its own completion state so a project's progress can roll up ("4 of 12 done").
- The list page surfaces in-progress work, overdue projects, and projects due within two weeks.
- All reads and writes respect RLS. All members of the org can read; staff+ can write.

## Non-goals (PR 1)

- **Item picker modal / knowledge linker modal.** Use interim inline checkbox lists instead — PR 2 replaces them.
- **Public viewer page.** Deferred to PR 3.
- **`MaintenanceProjectsCard` on item detail pages.** Deferred to PR 3.
- **Org-level maintenance surface.** The schema supports a nullable `property_id` so org-level projects are possible later; no UI for it yet.
- **Offline sync.** `maintenance_projects` are **not** added to `SYNC_TABLES`. Admin pages require a connection.
- **Field-worker completion flow.** Staff mark items done from the admin screens (desktop or mobile web). A dedicated offline field flow is a later effort.
- **Optimistic locking / conflict resolution.** Last-write-wins on edits — acceptable for the expected edit cadence.

## Data model

Migration file: `supabase/migrations/049_scheduled_maintenance.sql`.

### Tables

```sql
create table maintenance_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  scheduled_for date,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maintenance_project_items (
  maintenance_project_id uuid not null
    references maintenance_projects(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (maintenance_project_id, item_id)
);

create table maintenance_project_knowledge (
  maintenance_project_id uuid not null
    references maintenance_projects(id) on delete cascade,
  knowledge_item_id uuid not null
    references knowledge_items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (maintenance_project_id, knowledge_item_id)
);
```

### Indexes

```sql
create index idx_maintenance_projects_org on maintenance_projects(org_id);
create index idx_maintenance_projects_property on maintenance_projects(property_id);
create index idx_maintenance_projects_status on maintenance_projects(status, scheduled_for);
create index idx_mpi_project on maintenance_project_items(maintenance_project_id);
create index idx_mpi_item on maintenance_project_items(item_id);
```

### Triggers

`updated_at` auto-update trigger mirroring the `knowledge_items` trigger from migration 029.

### Status

User-controlled, no auto-transition. When every linked item has `completed_at` set, the project stays in `in_progress` until a user explicitly sets it to `completed`. Rationale: field workers often finish items before the coordinator formally closes the project.

### Progress rollup

Computed at read time, not stored:

```sql
count(mpi.*) filter (where mpi.completed_at is not null) as items_completed,
count(mpi.*) as items_total
```

### Scheduled-for semantics

`scheduled_for` is a `date` (not `timestamptz`). Planning granularity is days — a project is "on" a day, not "at" a time. Overdue logic compares to `current_date` in the user's timezone.

### SYNC_TABLES

`maintenance_projects`, `maintenance_project_items`, and `maintenance_project_knowledge` are **not** added to `SYNC_TABLES` in `src/lib/offline/sync-engine.ts`. This keeps PR 1 out of the offline-cache playbook. If a future PR needs offline support, the migration for that PR owns the `update … set updated_at = now()` requirement.

### RLS policies

Mirror the `knowledge_items` pattern (migration 029).

- **Select:** any member of the org.
- **Insert / update / delete:** `org_admin` or `org_staff` role on the project's org.
- **Junction tables:** parent-join SELECT (member), parent-join INSERT/UPDATE/DELETE (staff+).

Public-read policy deferred — PR 3 adds it when the public viewer lands.

## Routes

All three routes live under the existing property admin layout (`/admin/properties/[slug]/`), reusing its sidebar and chrome.

| Route | Purpose |
|---|---|
| `/admin/properties/[slug]/maintenance` | Index / list page |
| `/admin/properties/[slug]/maintenance/new` | Create form |
| `/admin/properties/[slug]/maintenance/[id]` | Detail / edit page |

Page files follow the existing App-Router pattern: a server `page.tsx` fetches data via `createClient()` from `@/lib/supabase/server` and passes it to a client component for interactivity.

## Sidebar nav

Add a **Maintenance** entry to the `items` array in `src/app/admin/properties/[slug]/layout.tsx`. The existing list is flat (no section headers); place Maintenance after the entity-type entries and before Data Vault (it's data/content, belongs with that cluster). `href: `${base}/maintenance``. No badge for PR 1.

## Components

New components, co-located with routes except where shared:

- `src/app/admin/properties/[slug]/maintenance/page.tsx` — server list page.
- `src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx` — client; owns tab + search state.
- `src/app/admin/properties/[slug]/maintenance/new/page.tsx` — server page that renders the client create form.
- `src/app/admin/properties/[slug]/maintenance/new/MaintenanceCreateForm.tsx` — client form component.
- `src/app/admin/properties/[slug]/maintenance/[id]/page.tsx` — server detail page.
- `src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx` — client form with save button.
- `src/app/admin/properties/[slug]/maintenance/actions.ts` — server actions (see next section).
- `src/app/admin/properties/[slug]/maintenance/schemas.ts` — Zod input schemas.

Shared UI primitives (under `src/components/maintenance/`):

- `MaintenanceStatusPill.tsx` — planned / in_progress / completed / cancelled, with icon.
- `MaintenanceStatCard.tsx` — 4-up stat row card.
- `MaintenanceProjectRow.tsx` — row on the list page.
- `MaintenanceItemPickerInterim.tsx` — placeholder checkbox-list picker (PR 2 replaces).
- `MaintenanceKnowledgePickerInterim.tsx` — placeholder checkbox-list picker (PR 2 replaces).
- `MaintenanceEmpty.tsx`, `MaintenanceLoading.tsx`, `MaintenanceError.tsx` — state screens.

### List page shape

- Header: "Scheduled Maintenance" title, "Admin · Data" breadcrumb, **New project** button (staff+ only).
- Stat strip: four `MaintenanceStatCard`s — In progress, Due in 2 weeks, Overdue, Completed this year.
- Tabs: Active, Completed, Cancelled, All (with counts).
- Search input (filters by title, client-side).
- Rows (one per project): title, status pill, Overdue / "in Nd" badge when applicable, scheduled date, item count, knowledge count (if any), progress bar (only when `status === 'in_progress'`), creator name, updated date, chevron.
- Empty state when `projects.length === 0`.

### Create page shape

Minimal form: **Title** (required), **Description** (optional textarea), **Scheduled date** (optional date input). On submit, call `createMaintenanceProject` and redirect to the detail page. No item / knowledge linking on the create page — that happens on detail.

### Detail page shape

- Header: back link, title, status pill, **Delete** button (with confirm dialog).
- Editable fields: **Title**, **Description**, **Scheduled date**, **Status** (dropdown).
- **Save** button — explicit, disabled until the form is dirty.
- **Linked items panel:** row per linked item (icon, name, type, last-maintained date); checkbox toggles completion (saves immediately via `setItemCompletion`); remove button. **Add items** opens `MaintenanceItemPickerInterim`.
- **Linked knowledge panel:** row per linked article (title, visibility badge); remove button. **Add article** opens `MaintenanceKnowledgePickerInterim`.

### Interim pickers

`MaintenanceItemPickerInterim` shows all items for the property in a plain checkbox list (no filter chips, no search, no map). Checking / unchecking calls `addItemsToProject` / `removeItemFromProject`. Rendered inline (modal-ish `<div>`), not `position: fixed` — keeps PR 1 off the modal-primitive path.

`MaintenanceKnowledgePickerInterim` shows all org knowledge items in a checkbox list. Same add/remove wiring; no inline "Create new" (that lands in PR 2).

### Styling

Tailwind throughout. Reuse `.card`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.label`. Status pill colors use existing CSS theme variables (forest / golden / sage / parchment). No inline style objects except where truly dynamic (progress bar width).

## Data flow

### Server actions (`actions.ts`)

All return `{ success: true, ... } | { error: string }`. All call `revalidatePath()` on the affected route after a successful mutation. RLS enforces permissions; actions surface Supabase errors as `{ error }`.

- `createMaintenanceProject({ propertyId, title, description, scheduledFor })` → `{ success: true, id } | { error }`
- `updateMaintenanceProject(id, { title, description, scheduledFor, status })` → `{ success } | { error }`
- `deleteMaintenanceProject(id)` → `{ success } | { error }`
- `addItemsToProject(projectId, itemIds[])` → `{ success } | { error }` — bulk insert, idempotent (ignores duplicates).
- `removeItemFromProject(projectId, itemId)` → `{ success } | { error }`
- `setItemCompletion(projectId, itemId, completed: boolean)` → `{ success } | { error }` — sets or clears `completed_at` / `completed_by`.
- `addKnowledgeToProject(projectId, knowledgeIds[])` → `{ success } | { error }`
- `removeKnowledgeFromProject(projectId, knowledgeId)` → `{ success } | { error }`

Input validation lives in `schemas.ts` (Zod). Actions parse inputs at the boundary; parse failures surface as `{ error }`.

### Server reads

Called directly from `page.tsx` server components, **not** via server actions.

- **List:** one query selecting projects for the property with a correlated aggregate subquery (or `LATERAL` join) that returns `items_completed` and `items_total` per project. Also join creator name.
- **Detail:** one query for the project with foreign-keyed joins to `items` (for linked items with completion state) and `knowledge_items` (for linked articles with title / visibility).

Both queries go through RLS; unauthorized rows are silently filtered.

### Client state

Plain React `useState` — tab, search input, form dirty state, confirm-dialog open. No global store. Server data re-loads via `revalidatePath` after mutations.

### Revalidation surface

| Mutation | Revalidates |
|---|---|
| create / update / delete project | list page + detail page |
| add / remove / complete item | detail page |
| add / remove knowledge | detail page |

## Error handling & states

### Empty / loading / error

- **Empty** — `MaintenanceEmpty` with clipboard icon, copy, and a **New project** CTA. Renders when the list returns zero rows.
- **Loading** — `MaintenanceLoading` renders skeleton stat cards + skeleton rows. Served via `loading.tsx` at the route.
- **Error** — `MaintenanceError` renders via `error.tsx` at the route. Retry button calls `router.refresh()`.

### Detail-page errors

- Project not found → Next.js `notFound()` → 404.
- Query error → `error.tsx` boundary with retry.

### Form & action errors

- Zod parse errors surface as `{ error: 'Title is required' }` and render inline next to the offending field.
- Action errors surface via the codebase's existing toast primitive. Toast message is the `{ error }` string (after trimming Supabase noise).

### Concurrency

Out of scope for PR 1. Last write wins.

### Edge cases handled

- Linked item deleted from `items` → `on delete cascade` removes the junction row. The detail page refetch no longer shows it.
- Linked knowledge deleted → same behavior.
- User loses staff+ role mid-edit → save fails with an RLS error; toast surfaces it.
- User lands on a project from another property → RLS filters the row; page shows 404.

## Testing

### Vitest unit + component tests

1. `__tests__/maintenance/maintenance-logic.test.ts` — pure helpers:
   - `computeProgress(completed, total)` returns the right percentage and `{completed, total}` label.
   - `classifyScheduled(scheduledFor, status)` flags overdue / due-soon / normal correctly.
2. `__tests__/maintenance/MaintenanceProjectRow.test.tsx` — status pill renders for each status; overdue badge appears only when `status === 'planned' && scheduledFor < today`; progress bar appears only when `status === 'in_progress'`.
3. `__tests__/maintenance/MaintenanceListClient.test.tsx` — tab switching filters; search narrows; empty state renders when filter yields zero rows.
4. `__tests__/maintenance/MaintenanceDetailForm.test.tsx` — empty-title rejected; save button disabled when unchanged; save button calls `updateMaintenanceProject`.

### Playwright E2E smoke

One new spec: `e2e/tests/maintenance.smoke.spec.ts`.

Flow: sign in as org staff → navigate to property → click **Maintenance** in the sidebar → see empty state → click **New project** → fill title + date → save → land on the detail page → open the interim item picker and add 2 items → check one item's completion box → navigate back to the list → row shows "1/2 done" progress.

### Visual baseline

Capture screenshots per `docs/playbooks/visual-diff-screenshots.md`: list page (populated), detail page (with linked items), empty state, loading skeleton. Include in the PR description.

### Accessibility

- Buttons have accessible names (text or `aria-label`).
- Form fields have associated `<label>` elements.
- Status pills have `aria-label` describing the status.
- The delete confirm dialog traps focus and restores it on close.

## File map (deliverables)

```
supabase/migrations/049_scheduled_maintenance.sql

src/app/admin/properties/[slug]/maintenance/
  page.tsx
  loading.tsx
  error.tsx
  actions.ts
  schemas.ts
  MaintenanceListClient.tsx
  new/page.tsx
  new/MaintenanceCreateForm.tsx
  [id]/page.tsx
  [id]/MaintenanceDetailForm.tsx

src/components/maintenance/
  MaintenanceStatusPill.tsx
  MaintenanceStatCard.tsx
  MaintenanceProjectRow.tsx
  MaintenanceItemPickerInterim.tsx
  MaintenanceKnowledgePickerInterim.tsx
  MaintenanceEmpty.tsx
  MaintenanceLoading.tsx
  MaintenanceError.tsx

src/__tests__/maintenance/
  maintenance-logic.test.ts
  MaintenanceProjectRow.test.tsx
  MaintenanceListClient.test.tsx
  MaintenanceDetailForm.test.tsx

e2e/tests/maintenance.smoke.spec.ts
```

The property admin sidebar (wherever it's defined — check `src/app/admin/properties/[slug]/layout.tsx` or an adjacent `AdminSidebar` wrapper) gets one new entry added in place.

## Open questions (resolved)

| # | Question | Answer |
|---|---|---|
| 1 | Scope decomposition (3 PRs)? | Yes |
| 2 | Project scoping (org vs property)? | Schema supports both; UI property-scoped for PR 1 |
| 3 | URL placement? | Under property admin — `/admin/properties/[slug]/maintenance` |
| 4 | Per-item completion tracking? | In PR 1 |
| 5 | Offline sync? | Defer — admin-only for PR 1 |
| 6 | Permissions? | Staff+ writes, members read (matches knowledge) |

## Out-of-band follow-ups (future PRs)

- **PR 2 — Pickers.** Replace `MaintenanceItemPickerInterim` with the designed list picker (filter chips by item type, status, last-maintained; select-all; search). Replace `MaintenanceKnowledgePickerInterim` with the knowledge linker modal (search, visibility filter, tag filter, "Create new" → new tab to `/admin/knowledge/new`).
- **PR 3 — Public viewer + item card.** Build `/p/[slug]/maintenance/[id]` (desktop + mobile) and `MaintenanceProjectsCard` on item detail pages. Adds the public-read RLS policy. Requires property (or project) visibility settings.
- **Offline support.** If field workers need to mark items done offline, add the tables to `SYNC_TABLES`, follow `docs/playbooks/offline-cache-schema-changes.md`, and queue `setItemCompletion` in the outbound mutation queue.
- **Org-level maintenance surface.** Build the top-level `/admin/maintenance` page that lists projects across all of the org's properties.
