# Timeline Updates Viewing — Design

> **Superseded by [`2026-04-20-item-timeline-v2-design.md`](./2026-04-20-item-timeline-v2-design.md).** The photo-led vertical rail, attribution, and species scope toggle replace the `UpdateCard` / adaptive-detail approach described below. This document remains for context on the prior iteration.

## Context

The `TimelineBlock` on item layouts is the primary surface where users browse the history of updates attached to an item. Today it renders `UpdateTimeline` (`src/components/item/UpdateTimeline.tsx`), a single 98-line component that draws a vertical timeline spine with per-update rows containing an icon, type name, date, text content, entity chips, and custom field values. It does not show photos, offers no "deeper dive" affordance, does not handle scheduled updates, and does not scale visually to items with many updates.

The feature targets mobile-first UX, because the `TimelineBlock` most often renders inside `DetailPanel` on a `MultiSnapBottomSheet` on mobile devices. Updates in FieldMapper carry mixed content — photos, prose, structured custom fields, entity links — with no single dominant shape. The new design needs to present an engaging overview that surfaces the most meaningful content per update, and let users dive into full detail on tap.

## Goals

- **Engaging overview** — rich cards with photo thumbnail, text preview, key field values; visible and scannable on a mobile bottom sheet.
- **Deep dive on tap** — full-screen detail sheet with adaptive layout based on update content.
- **Scale** — graceful handling when an item has many updates via a "View all" full-screen list.
- **Surface scheduled updates** — implement the existing `showScheduled` config option with a distinct visual treatment.
- **Mobile-first** — every decision prioritizes phone-sized viewport and touch interaction; desktop is a fallback path.
- **Role-gated edit/delete** — available from the detail view only, using existing `min_role_edit` / `min_role_delete` on update types.

## Non-Goals (V1)

- Creating scheduled updates (already supported by `UpdateForm` via `update_date` field; we only *display* them here).
- Filtering or search on the full list view.
- Date-range pickers, grouping by type, collapsible date sections.
- Long-press / kebab menu on overview cards.
- Inline editing in the detail view (uses existing edit flow).
- Pagination or lazy loading beyond the existing `maxItems` cap + full list view.
- New E2E tests (manual visual-diff screenshot pass only).

## Approach

Decompose the current monolithic `UpdateTimeline` into focused, single-purpose components under `src/components/item/timeline/`. Each piece has a narrow contract and is testable in isolation. The current `UpdateTimeline` is deleted; its two callers (`TimelineBlock`, `DetailPanel` legacy branch) are updated to use the new `TimelineOverview`.

## File Layout

### New files (`src/components/item/timeline/`)

- **`TimelineOverview.tsx`** — what `TimelineBlock` renders. Orchestrates scheduled section + recent list + "View all" button. Owns detail-sheet and all-updates-sheet open state.
- **`UpdateCard.tsx`** — rich card: type icon chip, relative date, 1–2 line text preview, single photo thumbnail, key field chips, entity pills. Atomic unit reused in overview and full list.
- **`UpdateDetailSheet.tsx`** — full-screen sheet. Adaptive layout (photo-hero / content-first / fields-first). Edit + delete actions role-gated.
- **`AllUpdatesSheet.tsx`** — full-screen sheet showing every update as a scrollable card list. No filters in V1.
- **`ScheduledUpdatesSection.tsx`** — collapsible section above recent past; muted visual style.
- **`timeline-helpers.ts`** — pure helpers: `partitionScheduled`, `detectPrimaryContent`, `getKeyFieldValues`.

### Files modified

- `src/components/layout/blocks/TimelineBlock.tsx` — swap `UpdateTimeline` for `TimelineOverview`; pass through `updateTypeFields`, permissions, `itemId`.
- `src/lib/layout/types.ts` — extend `TimelineConfig` (see below).
- `src/lib/layout/defaults.ts` (or equivalent defaults source) — default values for new config fields.
- Relevant Zod schema — new fields as `.default(true)` for backward compat.
- `src/components/layout/builder/TimelineBlockConfigPanel.tsx` (or similar path) — add toggles for the new config fields.
- `src/components/item/DetailPanel.tsx` — swap the legacy-branch `UpdateTimeline` usage for `TimelineOverview`.

### Files deleted

- `src/components/item/UpdateTimeline.tsx` — replaced.

## Data Flow

```
DetailPanel / LayoutRendererDispatch
  └── TimelineBlock (reads config)
        └── TimelineOverview (updates, updateTypeFields, config, permissions, itemId)
              ├── ScheduledUpdatesSection (if showScheduled && scheduled.length > 0)
              │     └── UpdateCard × N (tap → opens UpdateDetailSheet)
              ├── UpdateCard × min(past.length, maxItems)
              ├── "View all N updates" button (if past.length > maxItems)
              ├── UpdateDetailSheet (controlled: openUpdateId | null)
              └── AllUpdatesSheet (controlled: open)
                    └── UpdateCard × past.length (tap → also opens UpdateDetailSheet)
```

## Component Contracts

### `UpdateCard`

**Props:** `{ update, updateTypeFields, onTap, isScheduled?, showPhotos?, showFieldValues?, showEntityChips? }`

The three `show*` props default to `true` and mirror the corresponding `TimelineConfig` fields. `TimelineOverview` and `AllUpdatesSheet` both forward the config values, so a single source of truth (the layout config) controls both the inline timeline and the full-list view.

**Behavior:** Pure presentation. Whole card is a single `<button type="button">` (no nested tap targets). Renders:
- Colored type-icon chip (left) — always
- Header row: type name · relative date (title attr with absolute date for hover/SR) — always
- 1-line text preview with `line-clamp-2` — always (if content present)
- Single square photo thumbnail on the right (64×64), only if `showPhotos && photos?.[0]` exists
- Up to 2 key field chips (selected by `getKeyFieldValues`) — only if `showFieldValues`
- Entity pills (max 3, "+N more" if over) — only if `showEntityChips`
- `isScheduled` applies dashed left border, italic date ("Scheduled for..."), muted icon chip

### `UpdateDetailSheet`

**Props:** `{ update, updateTypeFields, isOpen, onClose, canEdit, canDelete, onEdit, onDelete }`

**Behavior:** Full-screen sheet. On mobile (`window.innerWidth < 768`), uses `MultiSnapBottomSheet` locked at `full` snap, stacked over the item sheet. On desktop, renders as a fixed-position overlay (`inset-0`) with a dimmed backdrop and a centered content container, using Tailwind utility classes — no new primitive component. Header: type name, full date + time, creator (if join available), close button, kebab menu (hidden if `!canEdit && !canDelete`). Adaptive body per Section "Adaptive Detail Rules" below. Footer: entity chips grouped by type. `AllUpdatesSheet` uses the same responsive-wrapper pattern.

### `AllUpdatesSheet`

**Props:** `{ updates, updateTypeFields, isOpen, onClose, onUpdateTap }`

**Behavior:** Full-screen sheet, scrollable list of `UpdateCard`s. Header: "All updates (N)" + close. No filters V1.

### `ScheduledUpdatesSection`

**Props:** `{ updates, updateTypeFields, onUpdateTap }`

**Behavior:** Collapsible section. Expanded by default if `scheduled.length <= 2`, collapsed otherwise with "Upcoming · N scheduled" header + chevron. Cards rendered with `isScheduled={true}`.

### `TimelineOverview`

**Props:** `{ updates, updateTypeFields, config, canEditUpdate, canDeleteUpdate, itemId }`

**Local state:**
- `detailUpdateId: string | null`
- `allUpdatesOpen: boolean`

**Behavior:** Partitions updates via `partitionScheduled`. Renders scheduled section (if enabled), then up to `maxItems` past cards, then "View all N updates" button (if `past.length > maxItems`). Hosts `UpdateDetailSheet` and `AllUpdatesSheet`.

## Adaptive Detail Layout Rules

All three detail-sheet variants share the same header and entity footer. Only the body's section order and emphasis change.

### Primary content detection (`detectPrimaryContent`)

Priority order, first match wins:

1. **`photos`** — if `update.photos?.length >= 1`
2. **`content`** — else if `update.content?.length > 40`
3. **`fields`** — else if `update.custom_field_values` has ≥ 1 non-empty value
4. **`content`** — fallback

The 40-char threshold distinguishes a quick note (where structured fields, if present, deserve primary focus) from a substantive observation (where prose leads).

### Variants

**`photo-hero`:**
- Full-width `PhotoViewer` at top (~40% viewport height on mobile, max 400px)
- Content paragraph
- Field values as definition list
- Entity chips grouped by type

**`content-first`:**
- Content paragraph, full typography (prose-sm, leading-relaxed)
- Photos as 2-column thumbnail grid → `PhotoViewer` on tap
- Field values
- Entity chips

**`fields-first`:**
- Field values as prominent definition list (larger labels)
- Content paragraph
- Photos as thumbnail grid
- Entity chips

All three render through a single component that orders sections via `switch (primary)`. No separate component per variant.

### Edit / delete affordance

- `canEdit = user.role >= update_type.min_role_edit`
- `canDelete = user.role >= update_type.min_role_delete`
- Shown as a kebab menu (⋮) in the top-right of the sheet header.
- Hidden if neither action is available.
- Edit → navigate to existing edit route (exact path confirmed during implementation).
- Delete → confirmation dialog, then existing server action.

## Scheduled Updates

**Definition:** `update.update_date > now()`. No DB changes required. Partitioning lives in `timeline-helpers.ts::partitionScheduled`.

**Visual distinction:**
- Dashed left border (`border-l-2 border-dashed border-sage-light`)
- Muted type-icon chip
- Italic date ("Scheduled for Apr 20")
- Tappable → same detail sheet

**Gating:** Only visible if `config.showScheduled === true`.

**Edge case:** existing item updates with future `update_date` values will now appear. Low risk — most existing rows have past dates.

## Empty and Edge States

- **No updates at all:** small icon + "No activity yet" + (if `canAddUpdate`) a text link using the existing `Add Update` affordance.
- **No past updates, has scheduled:** scheduled section only, no past empty state.
- **Past updates ≤ `maxItems`:** render all, no "View all" button.
- **Missing `update_type`:** fallback icon 📝 and label "Update" (preserve current behavior).
- **Missing photos / entities / fields:** sections hidden, not shown as empty.
- **Long content in card preview:** `line-clamp-2` truncates; full text in detail.
- **Broken / unloaded photo:** card shows icon chip only, not a broken image.
- **Offline-created updates with photo blobs:** card and detail sheet must accept the photo shape produced by the offline store; confirmed during implementation.

## Layout Builder Configuration

### `TimelineConfig` extensions (`src/lib/layout/types.ts`)

```ts
{
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
  showPhotos: boolean;         // NEW — photo thumbnails on cards
  showFieldValues: boolean;    // NEW — key field chips on cards
  showEntityChips: boolean;    // NEW — entity pills on cards
}
```

Defaults: all new fields default to `true`. Zod schema uses `.default(true)` so existing saved layouts remain backward-compatible. `TimelineBlockConfigPanel` (layout builder UI) grows three toggles for the new fields.

**Deliberately not added (YAGNI):** `density`, `dateFormat`, `groupBy`, `showScheduledExpanded`. Can be added later if need surfaces.

## Accessibility

- `UpdateCard` is a `<button type="button">` — keyboard focusable, screen-reader activatable.
- Detail sheet and all-updates sheet trap focus; restore focus to the opening card on close.
- Relative dates carry `title` attribute with absolute date.
- Icons in chips are decorative (`aria-hidden`), type name in text provides the label.

## Testing

Unit tests under `src/components/item/timeline/__tests__/`:

- **`timeline-helpers.test.ts`** — `detectPrimaryContent` rule table, `partitionScheduled` boundary (exact `now()` handling), `getKeyFieldValues` ordering/limit.
- **`UpdateCard.test.tsx`** — renders each content variation (photo/text/fields-only), tap fires `onTap`, truncation, missing type fallback, entity overflow, scheduled variant styling.
- **`UpdateDetailSheet.test.tsx`** — each of the three adaptive layouts renders for appropriate inputs, kebab menu visibility matches `canEdit`/`canDelete`, focus trap basics.
- **`TimelineOverview.test.tsx`** — "View all" button appears only when `past.length > maxItems`, scheduled section gated by config, empty state renders.
- **`AllUpdatesSheet.test.tsx`** — full list renders, tap-through opens detail sheet.

Integration: extend `blocks.test.tsx` for the new `TimelineBlock` behavior.

No new E2E in V1.

## Rollout

Since `UpdateTimeline` has only two callers, one-shot replacement. No feature flag.

TDD order:
1. `timeline-helpers.ts` + tests
2. `UpdateCard` + tests
3. `UpdateDetailSheet` + tests (validate stacked sheet behavior early)
4. `AllUpdatesSheet` + tests
5. `ScheduledUpdatesSection` + tests
6. `TimelineOverview` + tests
7. Wire into `TimelineBlock` + `DetailPanel` legacy branch; delete `UpdateTimeline`
8. Config schema & layout builder panel
9. Manual visual-diff screenshot pass per the repo's playbook

## Risks and Trade-offs

- **Stacked sheets on mobile:** `MultiSnapBottomSheet` hasn't been used stacked before. Potential z-index or scroll-lock issues. *Mitigation:* prototype stacked interaction in step 3. *Fallback:* detail sheet replaces the item sheet in push/pop fashion if stacking proves awkward.
- **Offline photo blob shape:** the detail sheet depends on `PhotoViewer` which expects the online photo model. *Mitigation:* confirm offline shape during step 3, adapt as needed.
- **Config backward compatibility:** added fields must have `.default(true)` in Zod to avoid breaking saved layouts.
- **"View all" sheet performance for items with hundreds of updates:** a naive list may scroll poorly. *Mitigation:* keep V1 simple; if a problem user surfaces, add virtualization later.

## Open Questions

- Exact path of the existing "edit update" route to navigate from the kebab menu. To be confirmed during step 7.
- Creator attribution: verify that `ItemUpdate.created_by` can be joined to a user display name for the detail-sheet header. If not trivial, V1 falls back to "Unknown" or hides the creator line.
