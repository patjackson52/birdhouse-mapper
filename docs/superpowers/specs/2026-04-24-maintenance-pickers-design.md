# Scheduled Maintenance Pickers — Design Spec (PR 2)

**Date:** 2026-04-24
**Branch:** `feat/maintenance-pickers`
**Builds on:** PR 1 (merged as `ea37d54`) — `docs/superpowers/specs/2026-04-23-scheduled-maintenance-design.md`
**Source design bundle:** `fieldmapper-scheduled-maintenance` (Claude Design handoff)

## Overview

PR 1 shipped admin CRUD for scheduled-maintenance projects with interim checkbox-list pickers for linking items and knowledge articles. This PR replaces those interim pickers with the designed modals — the recommended list-variant item picker (search + filter chips + select-all + sort) and the knowledge linker (search + visibility filter + tag chips + "Create new → new tab" callout).

The two components swap in as drop-in replacements at the same file paths. `MaintenanceDetailForm` updates two imports; nothing else changes.

## Goals

- `MaintenanceItemPicker` matches the design's list-variant layout: search, type chips, last-maintained chips, sort toggle, select-all bar with indeterminate state, per-item last-maintained tone indicator.
- `MaintenanceKnowledgePicker` matches the design's knowledge linker: search, visibility chips (All / Org / Public), tag chips, dashed "Create new → new tab" callout, card-style selectable articles.
- Responsive: full-screen on mobile (<md), centered modal on desktop (≥md) for the item picker. Knowledge picker is centered on all viewports (content is less dense).
- Each item surfaces its most recent **Maintenance**-type update as `last_maintained_at` for tone color and filter chips.
- Accessibility: focus trap, Escape-to-close, `aria-pressed` on chips, keyboard-reachable controls.

## Non-goals (PR 2)

- **Map variant** of the item picker — deferred; design explicitly offered two variants and we picked the list.
- **Keyboard-list navigation** (↑/↓ to move, Space toggle, Enter confirm) — deferred to a follow-up. Focus trap + Tab/Shift-Tab within modal IS in scope.
- **"Only items not in a project" toggle** — dropped (user decision: C in brainstorming). Defer until user demand surfaces.
- **Schema changes.** No migration.
- **New server actions.** `addItemsToProject` / `addKnowledgeToProject` already exist from PR 1 with the right contract.
- **Public viewer and item-detail card.** Remain PR 3.

## Data model — no changes

No schema migrations. All new data flow uses existing tables: `items`, `item_types`, `item_updates`, `update_types`, `knowledge_items`, `maintenance_projects`, `maintenance_project_items`, `maintenance_project_knowledge`.

### `last_maintained_at` derivation

Per user decision (option B in brainstorming): the most recent `item_updates.created_at` whose `update_type.name = 'Maintenance'`. Computed at picker-open time via a second batched query (see Data flow) — not stored, not indexed, computed on demand.

Rationale:
- Matches the filter's label ("Last maintained") semantically.
- Keeps the picker decoupled from maintenance-project completion history (different workflow).
- `update_types.name = 'Maintenance'` is a seeded global type (migration 002); safe to key on by name for this query.

## Components

New files under `src/components/maintenance/`:

- `MaintenanceItemPicker.tsx` — replaces `MaintenanceItemPickerInterim.tsx` (delete after wiring).
- `MaintenanceKnowledgePicker.tsx` — replaces `MaintenanceKnowledgePickerInterim.tsx` (delete after wiring).
- `useFocusTrap.ts` — tiny custom hook (~30 lines) colocated, takes a ref, traps focus, returns cleanup. Used by both pickers. If a similar utility already exists elsewhere in the codebase, use that one instead — do not duplicate.

Updates:

- `src/components/maintenance/MaintenanceItemPicker.tsx` and `…KnowledgePicker.tsx` replace their `Interim` counterparts in `MaintenanceDetailForm.tsx` — two import line changes, no prop shape changes.
- `src/lib/maintenance/logic.ts` — add `classifyLastMaintained(iso: string | null): { tone: 'fresh' | 'normal' | 'warn' | 'danger'; label: string }`.
- `src/styles/globals.css` — add `.chip` utility class for the filter chips used in both pickers and potentially elsewhere. One definition, ~6 lines.

### Item picker props (unchanged from interim)

```ts
interface Props {
  projectId: string;
  propertyId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}
```

### Knowledge picker props (unchanged)

```ts
interface Props {
  projectId: string;
  orgId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}
```

### `classifyLastMaintained`

```ts
export interface MaintenanceTone {
  tone: 'fresh' | 'normal' | 'warn' | 'danger';
  label: string;
}

export function classifyLastMaintained(iso: string | null): MaintenanceTone;
```

- `iso === null` → `{ tone: 'danger', label: 'Never' }`
- `days > 365` → `{ tone: 'danger', label: '{N} mo ago' }`
- `days > 180` → `{ tone: 'warn', label: '{N} mo ago' }`
- `days > 60` → `{ tone: 'normal', label: '{N} mo ago' }`
- `days <= 60` → `{ tone: 'fresh', label: '{N} d ago' }`

## UI / responsive behavior

### Item picker

| Viewport | Layout |
|---|---|
| ≥md | Centered overlay, `max-w-4xl` (~860px), `max-h-[90vh]`, rounded corners, `bg-black/40` backdrop |
| <md | Full-screen takeover — `fixed inset-0`, no rounded corners, no backdrop gap |

- Click-outside-to-close on desktop; disabled on mobile (deliberate — prevents accidental dismiss on scroll).
- Header: title + subtitle `{filtered.length} of {total} items · {selected.size} selected` + close (✕).
- Search row: autofocus input with leading icon.
- Type chips (dynamic from distinct `item_types` present in property items) + separator + last-maintained chips (`Any time` / `Not in 6 mo+` / `Not in 1 yr+` / `Never`).
- Select-all bar: checkbox with `indeterminate` state, label toggles between "Select all visible" and "{N} selected", clear button, sort toggle (`Name` ↔ `Oldest maint.`).
- List: each row = checkbox + icon box (item_type icon) + name + type/coord subtext + last-maintained label (tone-colored) + colored dot.
- Footer: cancel + primary "Add {N} items" (disabled when 0).

### Knowledge picker

- All viewports: centered `max-w-[600px]`, `max-h-[90vh]`.
- Header, search, visibility+tag chips, dashed "Create new" callout, card list, footer — per the design.
- "Create new" link: `<a href="/admin/knowledge/new" target="_blank" rel="noopener noreferrer" className="btn-secondary">`.
- Article card button: full-card click toggles selection; selected state = `border-forest` + tinted `bg-forest/5`.
- Footer: cancel + primary "Link {N}" (disabled when 0).

### Tone colors

Reuse Tailwind palette:
- `fresh`: `text-green-700`
- `normal`: `text-gray-500`
- `warn`: `text-amber-700`
- `danger`: `text-red-700`

Dot: same color.

### Chip utility

`src/styles/globals.css`:

```css
.chip {
  @apply inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-sage-light/60 text-gray-700 hover:bg-sage-light cursor-pointer transition-colors;
}
.chip[aria-pressed="true"] {
  @apply bg-forest text-white hover:bg-forest;
}
```

Each chip is `<button type="button" aria-pressed={active} className="chip">…</button>`.

## Data flow

### Item picker — initial fetch

Two queries (run in parallel in the same `useEffect`):

1. Items + item type:
   ```ts
   supabase
     .from('items')
     .select('id, name, lat, lng, item_type_id, item_types(name, icon)')
     .eq('property_id', propertyId)
     .order('name');
   ```

2. Maintenance-type updates for those items (runs after #1 so we have item IDs):
   ```ts
   supabase
     .from('item_updates')
     .select('item_id, created_at, update_types!inner(name)')
     .in('item_id', itemIds)
     .eq('update_types.name', 'Maintenance')
     .order('created_at', { ascending: false });
   ```

Client-side: group by `item_id`, take the first (most recent) `created_at` per item → `last_maintained_at`. Items with no maintenance updates get `null`.

Filter out `alreadyLinkedIds` from the returned list.

### Item picker — state

All client-side `useState`:
- `search: string`
- `selectedTypes: Set<string>` — initialized to all distinct types (i.e. all selected)
- `lastMaintFilter: 'any' | '6mo' | '1y' | 'never'`
- `sortKey: 'name' | 'last'`
- `selected: Set<string>` — initialized empty (never pre-select; the detail form's "already linked" list is filtered out)

`useMemo` on the filtered/sorted list, keyed on `(items, search, selectedTypes, lastMaintFilter, sortKey)`.

### Knowledge picker — initial fetch

```ts
supabase
  .from('knowledge_items')
  .select('id, title, excerpt, visibility, tags, updated_at')
  .eq('org_id', orgId)
  .order('title');
```

Filter out `alreadyLinkedIds`. Compute tag chip set as the union of all returned rows' `tags[]`.

### Commit

Unchanged from PR 1: `addItemsToProject({ projectId, itemIds })` / `addKnowledgeToProject({ projectId, knowledgeIds })`. On success → `router.refresh()` + `onClose()`. On `{ error }` → inline banner above footer, stay open.

## Error handling & states

| State | Behavior |
|---|---|
| Initial loading | Centered "Loading…" in list area; header visible, search/chips disabled |
| Fetch error | Inline banner at top of list area: "Couldn't load. Retry." button re-runs the query |
| Empty-after-filter | Centered muted text: "No items match your filters." / "No articles match." |
| Empty-initial (no items) | "This property has no items yet." + link to `/p/[slug]/admin/data` |
| Empty-initial (no knowledge) | "No knowledge articles yet." — "Create new → new tab" callout in header is the primary CTA |
| Save error | Inline red banner above footer with `{result.error}` |
| Concurrency (item already linked by another user) | Handled by existing `upsert(..., ignoreDuplicates: true)` — no user-facing error |

### Accessibility

- `role="dialog" aria-modal="true"` on modal container.
- Focus trap via `useFocusTrap` hook. Escape closes.
- On open, autofocus the search input.
- Filter chips: `<button type="button" aria-pressed={active}>`.
- Close button: `aria-label="Close"`.
- Item row: checkbox + label both inside the clickable row; row has `role="button"` and tab-focusable via `tabIndex={0}`; space/enter toggle selection.

## Testing

### Vitest unit tests

1. `src/__tests__/maintenance/classifyLastMaintained.test.ts`:
   - `null` → `'danger'` / `'Never'`
   - `>365d` → `'danger'`
   - `180d–365d` → `'warn'`
   - `60d–180d` → `'normal'`
   - `<60d` → `'fresh'`
   - Label format for days vs months

2. `src/__tests__/maintenance/MaintenanceItemPicker.test.tsx` (mock `@/lib/supabase/client` and `@/lib/maintenance/actions`):
   - Renders loading state
   - Items appear after fetch resolves
   - Type chip click toggles the filter
   - Last-maintained `1y+` chip filters to items older than 365 days (including never-maintained)
   - Search narrows by name
   - Select-all + indeterminate state
   - Clear empties selection
   - Primary disabled when 0 selected
   - Confirm calls `addItemsToProject` with selected IDs, closes on success
   - Save error renders inline; modal stays open

3. `src/__tests__/maintenance/MaintenanceKnowledgePicker.test.tsx`:
   - Tag chip filter narrows by tag
   - Visibility filter (Org / Public / All)
   - "Create new" link has `target="_blank"`, correct href, `rel="noopener noreferrer"`
   - Confirm calls `addKnowledgeToProject` and closes

### Playwright

No new E2E spec. The existing `e2e/tests/admin/maintenance.spec.ts` smoke already covers the add-items flow via `[role="dialog"]` + `input[type="checkbox"]` selectors. The new pickers preserve those roles and control types, so the existing assertions continue to pass.

### Visual baseline

Screenshots per `docs/playbooks/visual-diff-screenshots.md`:
- Item picker desktop (populated, with filters active)
- Item picker narrow viewport (full-screen on mobile)
- Knowledge picker with Create-new callout visible
- Empty state variations (no items in property, no filter matches)

### Accessibility pass

Manual: Tab into modal, cycle focusable controls, verify focus ring is visible, Escape closes. Screen reader sanity check — header heading, dialog label, button labels sensible.

## File map (deliverables)

```
src/components/maintenance/
  MaintenanceItemPicker.tsx               (new)
  MaintenanceKnowledgePicker.tsx          (new)
  useFocusTrap.ts                         (new — unless existing hook found)
  MaintenanceItemPickerInterim.tsx        (DELETE after swap)
  MaintenanceKnowledgePickerInterim.tsx   (DELETE after swap)

src/lib/maintenance/logic.ts              (extend: classifyLastMaintained export)
src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx  (two import swaps)
src/styles/globals.css                    (add .chip utility)

src/__tests__/maintenance/
  classifyLastMaintained.test.ts          (new)
  MaintenanceItemPicker.test.tsx          (new)
  MaintenanceKnowledgePicker.test.tsx     (new)
```

## Open questions (resolved)

| # | Question | Answer |
|---|---|---|
| 1 | `last_maintained_at` source? | B — MAX(`item_updates.created_at`) where update type is `Maintenance` |
| 2 | "Only items not in a project" toggle scope? | C — drop the toggle for PR 2 |
| 3 | Keyboard list nav + responsive layout? | B — responsive yes, keyboard list nav deferred |

## Out-of-band follow-ups

- **PR 3:** Public viewer at `/p/[slug]/maintenance/[id]` + inline `MaintenanceProjectsCard` on item detail pages.
- **Keyboard list navigation** inside pickers (↑/↓ move, Space toggle, Enter confirm) — separate polish pass once users ask.
- **Map variant** of item picker — if field teams ask for a map-centric selection flow, revisit.
- **"Avoid items in active projects"** filter — add if users report double-assignment collisions.
