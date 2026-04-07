# Layout Editor Drag-and-Drop Overhaul

**Issue:** [#200](https://github.com/patjackson52/birdhouse-mapper/issues/200)
**Date:** 2026-04-06
**Approach:** Extend existing `@dnd-kit/core` + `@dnd-kit/sortable` — no new dependencies

## Overview

Replace the layout editor's button-based block palette and grip-handle reordering with a unified drag-and-drop system. Users drag block chips from a palette into the layout, and drag existing blocks to reorder or move them between top-level and row positions. The layout visually reorganizes while dragging to show where the block will land.

## 1. Draggable Chip Palette

The current `BlockPalette` (grid of "Add ___" buttons) is replaced by a horizontal scrollable row of draggable chips pinned at the top of the builder panel.

- Each chip displays an icon + label for a block type
- Chips use `useDraggable` (not `useSortable`) — they are drag sources, not sortable items
- When a chip is grabbed, a new `LayoutBlock` is created with default config; this block becomes the active draggable
- The chip stays in the palette (it's a factory) — it dims slightly while its clone is being dragged
- The "Row" chip creates a 2-child row with placeholder blocks
- On mobile/touch: same chips, `TouchSensor` (150ms delay) activation

## 2. Drag Overlay & Visual Feedback

A `<DragOverlay>` at the `DndContext` level renders a semi-transparent full-size clone of the dragged block.

**Overlay rendering:**
- Renders the actual block component (e.g., `FieldDisplayBlock`, `PhotoGalleryBlock`) via `LayoutRenderer` in a constrained-width wrapper
- `opacity: 0.7` with subtle drop shadow
- For rows, the entire row with children renders in the overlay
- Content is `useMemo`-ized keyed by `activeId` — no re-renders during movement, position updates via CSS transform

**Ghost effect:**
- The original block in the layout gets `opacity: 0.3` while being dragged

**Palette drags:**
- The overlay is constructed from the newly created `LayoutBlock` rendered at builder-panel width (not from the small chip)
- If dropped outside any valid zone, the block is discarded

## 3. Drop Zones & Gap Animation

While dragging, the layout shows where the block will land by physically opening a gap.

### Top-level drop zones
- Invisible drop zones exist between every pair of top-level nodes, and before the first / after the last
- On hover, the gap animates open to roughly the height of the dragged block, capped at ~80px
- Animation: `transition: height 200ms ease-out` on a placeholder `div`
- Placeholder has a subtle tint (`bg-forest/5 rounded-lg`) to indicate the landing spot

### Row drop zones
- Each row exposes drop zones between its children and at start/end
- Same gap-opening behavior but horizontal (width animates open)
- Row drop zones are only active if the row has < 4 children
- If the dragged item is a row, row drop zones are disabled (no nested rows)

### Collision detection
- Custom collision detection function checking both top-level and row-internal gaps
- Priority: if cursor is within a row's bounding box, check row-internal zones first; otherwise fall back to top-level zones
- Based on `closestCenter`, extended with row-awareness

### Dragging out of a row
- When an existing row-child is dragged outside the row's bounding box, it detaches and becomes a candidate for top-level insertion
- If the source row drops to 1 child after the move, it auto-collapses (the single child replaces the row node)

## 4. State Management & Drop Handling

`onDragEnd` in `LayoutBuilder` is the central orchestrator, replacing the current simple reorder handler.

### Drag source identification
- Palette drags: ID prefixed with `palette-` — signals new block creation
- Existing blocks: use their existing `node.id` — signals a move

### Drop target metadata
Each drop zone carries data via `useDroppable`'s `data` prop:
- `{ zone: 'top-level', index: number }`
- `{ zone: 'row', rowId: string, index: number }`

### onDragEnd cases

| Source | Target | Action |
|--------|--------|--------|
| Palette | No valid target | Discard block |
| Palette | Top-level | Insert new block at index |
| Palette | Row | Insert new block into row children at index (if < 4 children) |
| Existing top-level | Top-level | Reorder via `arrayMove` |
| Existing top-level | Row | Remove from top-level, insert into row children |
| Existing row-child | Top-level | Remove from row, insert at top-level, auto-collapse row if needed |
| Existing row-child | Same row | Reorder within row children |
| Existing row-child | Different row | Remove from source row, insert into target row, auto-collapse source if needed |

All cases execute as a single `setLayout` call — no intermediate states.

## 5. Removed & Preserved Interactions

### Removed
- `BlockPalette` "Add ___" buttons — replaced by draggable chips
- `handleAddBlock` callback — block creation happens in drag start/end
- Grip handle icons on `BlockListItem` — entire block becomes drag handle
- `onAddToRow` button in `RowEditor` — blocks enter rows by dragging

### Preserved (no changes)
- Block config panel (expand/collapse accordion, inline field creator)
- Block delete (2-step confirmation)
- Row config (gap, distribution pickers in `RowEditor`)
- `SpacingPicker`, `PeekBoundary`
- Preview panel (detail/form tabs)
- All block rendering components

## 6. Mobile & Accessibility

**Mobile/touch:**
- `TouchSensor` with 150ms delay distinguishes scroll from drag
- Semi-transparent overlay follows finger via touch events
- Gap animation identical to desktop
- Palette chips in horizontal scroll — 150ms delay + 5px tolerance prevents conflict with horizontal scrolling

**Accessibility:**
- `KeyboardSensor` stays for keyboard-based reordering of existing blocks
- Palette chips get `aria-label="Drag to add {blockType}"`
- Keyboard activation: Enter/Space on a palette chip appends the block at the end as a fallback for non-drag interaction

## 7. Constraints

- Max 4 blocks per row
- No nested rows (rows cannot be dropped into rows)
- All block types allowed at any position (top-level or inside a row)
- Rows with 1 child auto-collapse to a standalone block

## 8. Files Affected

### Modified
- `src/components/layout/builder/BlockPalette.tsx` — rewrite as draggable chip bar
- `src/components/layout/builder/BlockList.tsx` — add `DragOverlay`, drop zones, custom collision detection
- `src/components/layout/builder/BlockListItem.tsx` — remove grip handle, make entire block draggable, add ghost styling
- `src/components/layout/builder/RowEditor.tsx` — add internal drop zones, remove "add to row" button
- `src/components/layout/builder/LayoutBuilder.tsx` — replace `handleAddBlock`/`handleReorder` with unified `onDragStart`/`onDragEnd`, manage active drag state

### New
- `src/components/layout/builder/DropZone.tsx` — reusable drop zone component with gap animation
- `src/components/layout/builder/DragOverlayContent.tsx` — renders the semi-transparent block clone for the overlay
- `src/components/layout/builder/collision.ts` — custom collision detection function (row-aware `closestCenter`)

### Unchanged
- `src/lib/layout/types.ts` — no data model changes
- `src/lib/layout/schemas.ts` — no validation changes
- All block rendering components, preview components, server actions
