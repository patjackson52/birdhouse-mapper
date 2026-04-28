# Upcoming Maintenance Block — Item Editor Component

**Date:** 2026-04-27
**Branch:** `maintenance-item-editor-component`
**Builds on:** PR #283 — Scheduled Maintenance public viewer + item block (`docs/superpowers/specs/2026-04-24-maintenance-public-viewer-design.md`)
**Source design bundle:** Claude Design artifact "Scheduled Maintenance" (handoff supplied as palette + state mockups)

## Overview

Replaces the existing `MaintenanceProjectsBlock` (shipped in PR #283) with an **Upcoming Maintenance** experience focused on what an item still needs done — with tappable rows, overdue/upcoming/unscheduled grouping, a per-row description preview, and a context-aware navigation target (staff → admin detail page; anonymous → public viewer).

Bundled with this enhancement, this PR also fixes a wiring bug from PR #283: the `maintenance_projects` palette chip was added to a dead palette file (`BlockPaletteV2.tsx`) instead of the live `ComponentDrawer.tsx`, so the block was invisible in the layout editor and could only be added by hand-editing JSONB. We add the chip to the right file and delete the three dead builder files (`BlockPaletteV2.tsx`, `LayoutBuilder.tsx`, `LayoutBuilderV2.tsx`) so the next contributor doesn't make the same mistake.

## Goals

- Operators can drag the **Upcoming Maintenance** chip from the layout editor's component drawer onto an item type's layout — both desktop sidebar and mobile drawer.
- On any item of a type that has the block, viewers see all upcoming maintenance projects for that item (status `planned` or `in_progress`), grouped Overdue → Upcoming → Unscheduled, sorted by `scheduled_for ASC` within each group.
- Each row is a tap target. Authenticated staff land on `/p/[slug]/admin/maintenance/[id]`; anonymous viewers land on `/p/[slug]/maintenance/[id]`.
- Each row shows a one-line truncated description preview underneath the title — the "short summary affordance" requested.
- Block always renders when present in the layout. Empty states ("No upcoming maintenance" / "All caught up — no upcoming maintenance") communicate clearly that the block is configured and working.
- A "Last maintained via *Title* · Date" footer appears whenever any linked completed project exists, including (especially) in the empty state.
- The `BlockPaletteV2.tsx`-bug class never recurs: a regression test asserts every `BlockTypeV2` value has a corresponding `ComponentDrawer.PALETTE_ITEMS` entry (or a documented opt-out).

## Non-goals

- **No schema changes** — `maintenance_projects` and `maintenance_project_items` are unchanged. The existing `description` column on `maintenance_projects` is reused for the row preview.
- **No new routes.** Tap targets land on routes that already exist.
- **No per-item maintenance index page** (no "View all 12" landing). All upcoming render inline; the block has no row cap.
- **No new RLS policies.** Read paths use the existing member RLS (admin context) and migration `050_maintenance_public_read.sql` (anonymous on active properties).
- **No block configuration surface** — no max-count, no filter toggles, no display variants. Per the brainstorming, zero config beyond the standard `width` / `permissions.requiredRole` shared by all V2 blocks.
- **No rename of the registry block type.** The discriminated-union value stays `'maintenance_projects'` to keep existing layout JSONB valid. The file, component, and palette label rename to "Upcoming Maintenance".
- **No real-time invalidation.** The block fetches on mount; reload or panel close/reopen refreshes. Live updates are out of scope for this PR.

## Data flow

### Single client query

The block fetches all linked projects in one round-trip and computes buckets / sort / counts client-side. Per-item project counts are small (~0–10), so a single query is preferable to two parallel queries:

```ts
supabase
  .from('maintenance_project_items')
  .select(
    'completed_at, maintenance_projects(id, title, description, status, scheduled_for, updated_at)',
  )
  .eq('item_id', itemId);
```

### Bucketing (client-side)

Given the result set, with `today = startOfDay(new Date())`:

- **`overdue`** — `status ∈ {planned, in_progress}` AND `scheduled_for < today`. Sorted by `scheduled_for ASC` (oldest = most overdue first).
- **`upcoming`** — `status ∈ {planned, in_progress}` AND `scheduled_for >= today`. Sorted by `scheduled_for ASC`.
- **`unscheduled`** — `status ∈ {planned, in_progress}` AND `scheduled_for IS NULL`. Sorted by `updated_at DESC`.
- **`lastCompleted`** — pick the row with the maximum `completed_at` (the per-item completion timestamp on the junction, not the project status). Used for the footer.

Counts in the header right-side: `"{N} upcoming"` where N = `overdue.length + upcoming.length + unscheduled.length`. If `overdue.length > 0`, append `" · {M} overdue"`.

### Tap target URL builder

```ts
function detailUrl(projectId: string, slug: string, isAuthenticated: boolean): string {
  return isAuthenticated
    ? `/p/${slug}/admin/maintenance/${projectId}`
    : `/p/${slug}/maintenance/${projectId}`;
}
```

Both routes already exist (`src/app/p/[slug]/admin/maintenance/[id]/page.tsx` and `src/app/p/[slug]/maintenance/[id]/page.tsx`). The block does not validate the routes; if a future change moves them, the block follows.

### Prop threading

`DetailPanel` already exposes:
- `slug` (line 64–66, from `useParams`)
- `isAuthenticated` (already passed to `LayoutRendererDispatch`)
- `userRole` (already passed to `LayoutRendererDispatch`)

Add **one** new prop in the renderer chain: `propertySlug: string | null`, threaded `DetailPanel` → `LayoutRendererDispatch` → `LayoutRendererV2` → `UpcomingMaintenanceBlock`. When `propertySlug` is `null` (e.g., block rendered in a non-property context like the future `/manage/edit/[id]` preview), rows render as static (no `<a>`) and chevrons hide. The block does not crash.

## UI components

### `UpcomingMaintenanceBlock` (renamed from `MaintenanceProjectsBlock.tsx`)

Single client component. File rename is a `git mv` to preserve history. Imports update in `LayoutRendererV2.tsx`. The block's exported name in the registry — i.e., the `'maintenance_projects'` discriminated-union value — does not change.

Render tree:

```
<div class="card p-4">
  <Header>                                  // 🔧 + "Upcoming Maintenance" + count
  {error ? <ErrorLine /> : null}
  {isLoading ? <Skeleton /> : null}
  {!isLoading && !hasUpcoming ? <EmptyState /> : null}
  {!isLoading && hasUpcoming ? (
    <>
      <Subgroup label="Overdue" tone="overdue" rows={overdue} />
      <Subgroup label="Upcoming" rows={upcoming} />
      <Subgroup label="Unscheduled" rows={unscheduled} />
    </>
  ) : null}
  {lastCompleted ? <Footer project={lastCompleted} /> : null}
</div>
```

### `Subgroup` (private to the file)

- Renders a small uppercase label (`Overdue` is red — `text-red-700`; others are `text-gray-600`).
- Skips entirely if `rows.length === 0`.
- Maps rows to `<MaintenanceRow>`.

### `MaintenanceRow` (private to the file)

- Wraps in `<a href={detailUrl(...)}>` when `propertySlug != null`, otherwise a plain `<div>`.
- Layout: status pill (existing `MaintenanceStatusPill size="sm"`), title (truncate), right-side date or `"Xd late"` (red, no date for overdue), chevron `›`.
- Below the flex row: one-line description preview using `line-clamp-1`. Hidden when description is empty/null.
- Overdue rows get `border-red-200 bg-red-50` (overrides the default `border-sage-light bg-white`).

### Header

- Left: 🔧 icon tile + "Upcoming Maintenance" heading (existing styles).
- Right: count line. Empty when there are zero upcoming projects (matches the empty-state mockups).

### Empty state

- If `lastCompleted` exists: text reads "All caught up — no upcoming maintenance."
- If `lastCompleted` is null: text reads "No upcoming maintenance."
- Both use `text-sm text-gray-600 italic`.

### Footer

- Renders only when `lastCompleted` is set.
- Format: `Last maintained via {strong title} · {formatted date}`.
- Separator: dashed border-top inside the card.

## ComponentDrawer fix

`src/components/layout/builder/ComponentDrawer.tsx:15-26` — add one entry to `PALETTE_ITEMS`:

```ts
{ type: 'maintenance_projects', icon: '🔧', label: 'Upcoming Maintenance' },
```

Insertion point: between `timeline` and `text_label` (matching the slot PR #283 used in the dead `BlockPaletteV2.tsx`).

## Dead code removal

Delete in this PR:

- `src/components/layout/builder/BlockPaletteV2.tsx`
- `src/components/layout/builder/LayoutBuilder.tsx`
- `src/components/layout/builder/LayoutBuilderV2.tsx`
- Any tests under `src/components/layout/builder/__tests__/` that exclusively test the above (verify each: only delete tests that reference *only* the deleted files; tests covering `LayoutEditor` / `BlockPalette` / `ComponentDrawer` stay).

Verify with `rg "(BlockPaletteV2|LayoutBuilder|LayoutBuilderV2)" src/` before delete; expect zero matches in non-deleted code.

## Files touched

| File | Change |
|---|---|
| `src/components/layout/blocks/MaintenanceProjectsBlock.tsx` | `git mv` → `UpcomingMaintenanceBlock.tsx`, full rewrite |
| `src/components/layout/builder/ComponentDrawer.tsx` | Add maintenance chip to `PALETTE_ITEMS` |
| `src/components/layout/LayoutRendererV2.tsx` | Update import + pass `propertySlug` / `isAuthenticated` props to block |
| `src/components/layout/LayoutRendererDispatch.tsx` | Thread `propertySlug` prop |
| `src/components/item/DetailPanel.tsx` | Pass `propertySlug={slug}` to `LayoutRendererDispatch` |
| `src/components/layout/blocks/__tests__/UpcomingMaintenanceBlock.test.tsx` | New file — comprehensive coverage (no existing test for the old block) |
| `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx` | Add regression test (palette parity) |
| `src/components/layout/builder/BlockPaletteV2.tsx` | Delete |
| `src/components/layout/builder/LayoutBuilder.tsx` | Delete |
| `src/components/layout/builder/LayoutBuilderV2.tsx` | Delete |
| `src/components/layout/builder/__tests__/*` | Delete only tests exclusive to the above three |
| `e2e/tests/admin/maintenance.spec.ts` | Extend (or new spec) — chip-in-drawer + tap-target navigation |

## Testing

### Unit (Vitest + @testing-library/react)

For `UpcomingMaintenanceBlock.test.tsx`, mock the Supabase client to return a controlled fixture per case:

1. **Loading** — Supabase pending; renders skeleton testid `mp-block-skeleton`.
2. **Mixed state** — fixture has 1 overdue + 2 upcoming + 1 unscheduled + 1 completed. Asserts:
   - Header reads "Upcoming Maintenance" + "4 upcoming · 1 overdue".
   - Three subgroup labels render in order.
   - Overdue row has `border-red-200`, shows "Xd late" (computed against a fixed `Date.now()` mock), no date.
   - Each row's `<a>` has the correct `href` for `isAuthenticated=true`.
   - Description preview truncates with `line-clamp-1`.
   - Footer shows "Last maintained via {title} · {date}".
3. **Caught-up state** — fixture has 0 active + 1 completed. Asserts empty text "All caught up — no upcoming maintenance." + footer renders.
4. **No-history state** — fixture has 0 active + 0 completed. Asserts empty text "No upcoming maintenance." + no footer.
5. **Anonymous tap target** — `isAuthenticated=false`, asserts `href` uses `/p/{slug}/maintenance/{id}` (not `/admin/`).
6. **No slug** — `propertySlug=null`, asserts rows render as `<div>` (no `<a>`), chevrons hidden, no crash.
7. **Error** — Supabase returns `{ error: { message: 'boom' } }`. Asserts the inline error line renders, header still visible.

For `ComponentDrawer.test.tsx`:

8. **Palette parity (regression)** — assert that every value in the `BlockTypeV2` discriminated union appears as the `type` of some entry in `PALETTE_ITEMS`. This is the regression guard for the PR #283 wiring bug: any future block addition that touches the registry but forgets the drawer will fail this test at CI time.

### E2E (Playwright)

Add to `e2e/tests/admin/maintenance.spec.ts` (or new file `maintenance-block.spec.ts`):

9. As a staff user, open the layout editor for an item type. The "Upcoming Maintenance" chip is visible in the desktop sidebar.
10. Drag the chip into the layout, save. On an item of that type, the block renders.
11. Click an upcoming row → URL changes to `/p/{slug}/admin/maintenance/{id}`.
12. As an anonymous viewer on a public item profile, click an upcoming row → URL changes to `/p/{slug}/maintenance/{id}`.

### Visual

Per `docs/playbooks/visual-diff-screenshots.md`, capture before/after of an item with maintenance in the side panel. Include in PR description.

## Migration / rollout

- No DB migration. No env changes.
- The block type identifier `'maintenance_projects'` is unchanged, so any item type that already has the (invisible) PR #283 block in its `layout` JSONB will start rendering the new behavior on deploy without operator action.
- New text labels are user-visible. Translate via existing patterns (none needed for the current single-locale build).
- Risk surface is small: one-file behavioral rewrite + one chip add + dead-code delete. No data writes, no auth changes.

## Open questions

None — all clarifying questions resolved during brainstorming. The "View all" / pagination / map-popup integration paths are explicit non-goals, deferrable to a future PR if real-world counts justify it.
