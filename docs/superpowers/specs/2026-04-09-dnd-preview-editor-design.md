# Drag & Drop Preview Editor Design

**Date:** 2026-04-09
**Status:** Draft
**Branch:** `feat/dnd-preview-mode`
**Depends on:** v2 layout model (#232), layout editor DnD overhaul

## Summary

Replace the split builder-panel + preview-tab layout editor with a unified editing surface where the live preview IS the editor. Users drag components directly into the rendered preview. The layout reflows in real-time to show where a dropped component will land. Works on both mobile and desktop with platform-appropriate interaction patterns.

## Design Principles

- **The preview is the editor.** No separate "build" panel. What you see is what you get — literally the same `renderBlock()` function renders blocks in edit mode and production.
- **Spatial row creation.** Rows are created by dropping beside a block, not by dragging an explicit "Row" component. The layout is smart about what you mean.
- **Edit mode is opt-in.** A toggle switches between read-only preview (identical to production) and the editable surface. Admin sees exactly what end-users see before committing to changes.
- **No data model changes.** The `TypeLayout` JSON schema is unchanged. This is purely a UI/interaction redesign.

## Approach

**Editable Renderer** — Create an `EditableLayoutRenderer` that reuses the existing `LayoutRenderer`'s `renderBlock()` function but wraps each block output with droppable/draggable wrappers and inserts drop zone components between blocks. The `LayoutRenderer` itself stays untouched for production and view-mode use.

Alternatives considered:
- **Overlay Grid** (invisible drop zones layered over read-only preview) — rejected due to fragile position synchronization across scroll, resize, and animation.
- **Virtual Preview** (separate editable component) — rejected due to block rendering duplication and WYSIWYG divergence.

---

## 1. Component Architecture

### New component tree

```
LayoutEditor (replaces LayoutBuilder)
├── Header (Save/Cancel/Done + Edit toggle)
├── DndContext (wraps everything below)
│   ├── ComponentDrawer
│   │   ├── Desktop: vertical sidebar with palette chips
│   │   └── Mobile: expandable FAB → half-height bottom sheet with chip grid
│   ├── EditableLayoutRenderer (the preview-as-editor)
│   │   ├── DropZone (before first block)
│   │   ├── EditableBlock (wraps each rendered block)
│   │   │   ├── DragHandle overlay (visible in edit mode)
│   │   │   ├── SideDropZone (left edge — auto-row creation)
│   │   │   ├── Block content (rendered via renderBlock())
│   │   │   └── SideDropZone (right edge — auto-row creation)
│   │   ├── DropZone (between blocks)
│   │   ├── EditableRow (wraps LayoutRow nodes)
│   │   │   ├── EditableBlock per child
│   │   │   └── DropZone between children (horizontal)
│   │   └── DropZone (after last block)
│   └── DragOverlay (ghost preview while dragging)
├── ConfigDrawer (bottom drawer, opens on block tap in edit mode)
└── PreviewTabBar (detail/form toggle — form preview stays read-only)
```

### Key changes from current architecture

| Current | New | Reason |
|---|---|---|
| `LayoutBuilder.tsx` | `LayoutEditor.tsx` | No more "build" tab or `BlockList`/`BlockListItem` |
| `BlockPalette.tsx` (horizontal chips) | `ComponentDrawer.tsx` (vertical sidebar desktop, FAB drawer mobile) | Platform-appropriate picker |
| `BlockConfigPanel.tsx` (inline accordion) | `ConfigDrawer.tsx` (bottom drawer) | Works in preview context without shifting layout |
| "Build" tab on mobile | Edit mode toggle | Single unified surface |
| "Row" palette item | Auto-row via side-drop | Spatial creation is more intuitive |

### Kept as-is

- `LayoutRenderer.tsx` — used for view mode and production. Untouched.
- `DropZone.tsx` — reused with minor size update (collapsed: 4px instead of 8px)
- `DragOverlayContent.tsx` — reused for drag ghost
- `collision.ts` — extended with side-zone priority, core logic stays
- `FormPreview.tsx` — stays read-only via detail/form tab toggle
- All block components (`StatusBadgeBlock`, `FieldDisplayBlock`, etc.) — unchanged
- All data types (`TypeLayout`, `LayoutNode`, `LayoutBlock`, `LayoutRow`, `BlockType`)
- `mock-data.ts`, `defaults.ts`, `schemas.ts`, `spacing.ts`

### New files

| File | Purpose |
|---|---|
| `LayoutEditor.tsx` | Top-level orchestrator replacing `LayoutBuilder.tsx` |
| `EditableLayoutRenderer.tsx` | Preview-as-editor with DnD affordances |
| `EditableBlock.tsx` | Draggable/selectable wrapper around rendered blocks |
| `SideDropZone.tsx` | Left/right edge drop zones for auto-row creation |
| `ComponentDrawer.tsx` | Vertical sidebar (desktop) + expandable FAB drawer (mobile) |
| `ConfigDrawer.tsx` | Bottom sheet for block configuration |
| `useLayoutHistory.ts` | Undo/redo hook managing past/future stacks |

---

## 2. Drag & Drop Mechanics

### Drag sources

1. **Palette chips** — `useDraggable` with `data: { type: BlockType, source: 'palette' }`. On mobile, long-press (150ms) initiates drag from the expanded drawer.
2. **Existing blocks in preview** — Each `EditableBlock` uses `useDraggable`. Desktop: small drag handle icon on hover (top-left). Mobile: long-press anywhere on the block.

### Drop targets — three zone types

**Vertical drop zones** (between top-level blocks):
- Full-width horizontal gaps
- Animate from 4px → 60px height when hovered (200ms ease-out)
- Dropping inserts a block at that position in `layout.blocks[]`

**Horizontal drop zones** (inside rows, between children):
- Vertical gaps between row children
- Same expand animation on width axis
- Dropping inserts into the row's `children[]` array
- Disabled when row has 4 children

**Side drop zones** (left/right edges of standalone blocks):
- 20px wide zones on left/right edges of non-row blocks
- Trigger auto-row creation on drop
- On blocks inside a row, side zones redirect to the parent row's `children[]` insert (prevents nested rows)
- When hovered on standalone blocks, placeholder appears beside the target showing a horizontal split

### Collision detection

Extend the existing `rowAwareCollision` with priority order:
1. Side drop zones (smallest targets, highest priority)
2. Row-internal horizontal zones
3. Top-level vertical zones

### Placeholder rendering

When dragging over any drop zone, a dashed-border placeholder slot appears:

```css
border: 2px dashed theme(colors.forest / 0.3);
border-radius: 8px;
background: theme(colors.forest / 0.03);
```

- Height: ~60px for vertical zones
- Width: proportional share for horizontal/side zones
- Sized to match block spacing of current layout (`SPACING[layout.spacing]`)
- Fade-in: 150ms

### Drag overlay

- Palette drags: small chip-style indicator (lightweight)
- Existing block drags: semi-transparent rendered block via `DragOverlayContent`

---

## 3. Edit Mode Toggle & State

### Toggle behavior

`isEditing` boolean state in `LayoutEditor`. Pill button in toolbar: `👁 Preview` / `✏️ Edit`.

| Mode | Behavior |
|---|---|
| **View** (default) | Standard `LayoutRenderer`, read-only. No drag handles, drop zones, or picker. Identical to production. |
| **Edit** | `EditableLayoutRenderer`. Component drawer appears. Blocks get drag handle overlays. Faint outlines on block boundaries. |

Transition between modes: 200ms crossfade.

### Layout state

Single `useState<TypeLayout>` — source of truth for both the editable renderer and form preview. All mutations produce a new `TypeLayout` object.

```
Drag drop → handleDragEnd → setLayout(newLayout) → EditableLayoutRenderer re-renders
Block tap → ConfigDrawer → config change → setLayout(newLayout) → preview updates
Save → onSave(layout, pendingFields) → server action persists to item_types.layout
```

### Undo/redo

`useLayoutHistory` hook maintaining a history stack:
- Each mutation pushes previous layout onto `past[]`
- Undo pops from `past[]`, pushes current to `future[]`
- Max 30 entries
- Desktop: undo/redo buttons in header + `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`
- Mobile: floating undo/redo pill

### Pending fields

Same as current — `field_display` blocks with new inline fields go into `pendingFields[]` with temp IDs. On save, pending fields are created server-side first, then layout is saved with real field IDs.

### Unsaved changes indicator

Subtle dot on the Save button when `layout` differs from `initialLayout`. No auto-save.

---

## 4. Mobile UX

### Screen layout

```
┌─────────────────────────────┐
│  Cancel    Bird Layout   Done│  ← Fixed header
│  [👁 Preview] [✏️ Edit]      │  ← Mode toggle
├─────────────────────────────┤
│                             │
│   ┌─────────────────────┐   │
│   │  📷 Photo Gallery   │   │  ← Rendered blocks
│   ├─────────────────────┤   │     (scrollable)
│   │  🏷 Active          │   │
│   ├─────────────────────┤   │
│   │  📊 Species  │ 📊 D │   │  ← Row
│   ├─────────────────────┤   │
│   │  📋 Timeline        │   │
│   └─────────────────────┘   │
│                             │
│                         (＋)│  ← FAB (bottom-right)
└─────────────────────────────┘
```

### Component drawer (mobile)

- `+` FAB in bottom-right corner (above safe area insets), visible only in edit mode
- Tap to expand: half-height bottom sheet slides up containing palette chips in a 3-column grid
- Each chip: 44px+ tap target with icon and label
- **Long-press a chip** (150ms) to start dragging. Drawer stays open but dims slightly. User drags upward into preview. Drop zone placeholders animate in. Lift finger to drop.
- **Tap a chip** for quick-add: appends block to end of layout (no drag). Escape hatch for small screens.

### Drag interaction on mobile

- Touch sensor: 150ms delay, 5px tolerance (distinguishes scroll from drag)
- Auto-scroll: preview scrolls when finger approaches top/bottom 60px (speed proportional to edge distance)
- Haptic feedback: `navigator.vibrate(10)` on drag start and entering new drop zones (where supported)
- Drag overlay follows finger with slight offset so user can see drop zone beneath

### Rearranging blocks on mobile

Long-press any block in edit mode starts rearrange drag. Block lifts with subtle scale-up (1.02) and shadow, follows finger. Same auto-scroll and haptic behavior.

### Config drawer (mobile)

Tap block in edit mode → bottom sheet slides to half-screen height. Swipe up for full height. Same config fields as desktop. Delete button at bottom with confirmation. Swipe down or tap outside to dismiss.

### Form preview on mobile

Detail/Form tab toggle at top of preview area. Form preview is always read-only.

---

## 5. Desktop UX

### Screen layout

```
┌──────────────────────────────────────────────────────────┐
│  ← Back    Bird Layout    [↩ Undo] [↪ Redo]  Cancel Save│
├──────────────────────────────────────────────────────────┤
│  [👁 Preview]  [✏️ Edit]          [Detail ▪] [Form]      │
├─────────┬────────────────────────────────────────────────┤
│         │                                                │
│  📊 Field│         ┌──────────────────────────┐          │
│  📷 Photo│         │                          │          │
│  🏷 Status│        │    🐦 Red-tailed Hawk    │          │
│  🔗 Entities│      │    ┌────────────────┐    │          │
│  📋 Timeline│      │    │ 📷 Hero Photo  │    │          │
│  ✏️ Text │         │    ├────────────────┤    │          │
│  ➖ Divider│        │    │ 🏷 Active      │    │          │
│  📍 Map  │         │    ├───────┬────────┤    │          │
│  🔘 Actions│       │    │Species│  Date  │    │          │
│         │          │    ├───────┴────────┤    │          │
│         │          │    │ 📋 Timeline    │    │          │
│         │          │    └────────────────┘    │          │
│         │          │                          │          │
│         │          └──────────────────────────┘          │
│         │                                                │
└─────────┴────────────────────────────────────────────────┘
```

### Component sidebar (desktop)

- Fixed-width sidebar (~140px) on the left, visible only in edit mode
- Chips stacked vertically: icon + label, full sidebar width, 44px height each
- Slides in from left (200ms) on edit mode enter, slides out on exit
- User drags chip rightward into the preview
- Sidebar stays visible during drag
- Narrower screens (768–1024px): icon-only (~56px) with labels as tooltips

### Preview card

Centered in remaining space, max-width ~480px (mimics mobile bottom sheet width). White background, rounded corners, shadow — same styling as current detail preview. Gives admin an honest view of how the layout looks on mobile.

### Hover affordances in edit mode

- Blocks get subtle 1px dashed outline on hover (`border: 1px dashed sage/40`)
- Drag handle icon (grip dots) appears top-left on hover
- Gear icon appears top-right on hover → opens config drawer
- Affordances fade in/out (150ms), absolutely positioned (no layout shift)

### Config drawer (desktop)

Same bottom drawer as mobile for consistency. Max-width 480px, centered at bottom, with backdrop dimming. Changes apply immediately to preview.

### Keyboard support

| Key | Action |
|---|---|
| `Escape` while dragging | Cancel drag |
| `Escape` with drawer open | Close config drawer |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` with block selected | Delete (with confirmation) |

---

## 6. Animation & Layout Reflow

### Drop zone expansion

| Zone type | Animation | Duration |
|---|---|---|
| Vertical (between top-level blocks) | height: 0 → 60px | 200ms ease-out |
| Horizontal (inside rows) | width: 0 → proportional share | 200ms ease-out |
| Side (auto-row creation) | target block shrinks + placeholder grows simultaneously | 200ms ease-out |

When drag leaves a zone, it collapses back (200ms ease-out). Only one placeholder visible at a time.

### Placeholder appearance

```css
border: 2px dashed theme(colors.forest / 0.3);
border-radius: 8px;
background: theme(colors.forest / 0.03);
opacity: 0 → 1 over 150ms;
```

### Surrounding block reflow

- Layout uses `display: flex; flex-direction: column; gap` (existing pattern)
- Drop zones always present in DOM between blocks at `height: 0; overflow: hidden`
- On activation, transition to expanded height — flexbox naturally pushes siblings
- Single CSS property animation (`height` or `width`) for browser optimization
- `will-change: height` applied during active drag, removed after drag ends

### Block lift animation (rearranging)

1. Original position fades to ghost outline (opacity 0.25, 150ms)
2. `DragOverlay` scales up (1.02) with shadow, follows cursor/finger
3. Ghost collapses to `height: 0` (200ms ease-out), siblings close gap
4. On drop: overlay animates to final position (dnd-kit `dropAnimation`, 200ms ease-out), placeholder crossfades into rendered block (150ms)

### Auto-row creation animation

1. Target block narrows from 100% → 50% width (200ms)
2. Placeholder grows from 0% → 50% beside it (200ms)
3. Subtle shared background (`forest/5`) fades in around both
4. Reverses if drag leaves the side zone

### Row dissolution animation

Row border fades out (150ms) as lone child expands to full width (200ms).

### Performance guardrails

- Animate only `height`, `width`, `opacity`, `transform` — no layout-thrashing properties
- `React.memo` on all block content components — internals don't re-render during drag
- Drop zone hit detection via dnd-kit collision math, not DOM events per pixel
- `useRef` for active drop zone ID — only entering/leaving zones re-render

---

## 7. Auto-Row Creation & Row Management

### Drop zone geometry for a standalone block

```
         ┌── Vertical drop zone (above) ──┐
         │         full width, 4px         │
         ├────┬────────────────────┬───────┤
         │    │                    │       │
         │ S  │   Block content    │  S    │
         │ I  │                    │  I    │
         │ D  │                    │  D    │
         │ E  │                    │  E    │
         │    │                    │       │
         ├────┴────────────────────┴───────┤
         │         full width, 4px         │
         └── Vertical drop zone (below) ──┘

  SIDE = 20px wide, full block height
```

### Decision logic

| Drop location | Result |
|---|---|
| Vertical zone above/below block | Insert new block at that top-level position |
| Side zone of standalone block | Wrap target + new block in a `LayoutRow` |
| Horizontal zone inside existing row | Insert new block into row's `children[]` |
| Side zone of block inside a row | Insert into parent row (no nested rows) |

### Row creation on side-drop

```typescript
// Target block at index i in layout.blocks[]
// Drop on right side zone → new block goes right
const newRow: LayoutRow = {
  id: nanoid(10),
  type: 'row',
  children: [existingBlock, newBlock], // left-drop reverses order
  gap: 'normal',
  distribution: 'equal',
};
// Replace standalone block at index i with the row
layout.blocks[i] = newRow;
```

### Row dissolution

| Remaining children | Result |
|---|---|
| 2+ | Row stays, children rebalance |
| 1 | Row dissolves, lone child becomes standalone at row's position |
| 0 | Row removed entirely |

### Row limits

- Max 4 children per row
- At 4 children: internal horizontal zones and side zones disable (placeholder won't appear)
- No nested rows — side zones on blocks inside rows redirect to parent row's `children[]`

### Visual feedback

- Side zone hover: target block + placeholder get shared `forest/5` background
- Edit mode: existing rows show faint container outline (`1px dashed sage/20`)
- Row dissolution: border fades out (150ms), lone block expands to full width (200ms)

---

## 8. Config Drawer & Block Selection

### Block selection

In edit mode, tap/click a block to select it:
- Selected: solid 2px `forest` border (replaces dashed hover outline)
- Floating toolbar appears above selected block: `⠿ Drag` | `⚙ Config` | `🗑 Delete`
- `⚙ Config` or double-tap → opens config drawer
- Tap outside / press `Escape` → deselects
- One block selected at a time

### Config drawer

Bottom sheet, consistent on mobile and desktop.

```
┌─────────────────────────────────┐
│  ─── (swipe handle)             │
│                                 │
│  📷 Photo Gallery         🗑    │  ← Block type + delete
│  ─────────────────────────────  │
│                                 │
│  Style                          │
│  [Hero ▪] [Grid] [Carousel]    │  ← Segmented control
│                                 │
│  Max Photos                     │
│  [  4  ]  (stepper)             │
│                                 │
│  □ Hide when empty              │
│                                 │
└─────────────────────────────────┘
```

**Behavior:**
- Desktop: max-width 480px, centered at bottom, backdrop dims rest
- Mobile: full-width, half-screen height, swipe up for full
- Changes apply immediately (live preview feedback)
- Swipe down or tap backdrop to dismiss
- Auto-dismisses if user starts dragging a block

### Config per block type

| Block | Config options |
|---|---|
| `field_display` | Field picker (dropdown + "Create new field"), size (compact/normal/large), show label toggle |
| `photo_gallery` | Style (hero/grid/carousel), max photos |
| `text_label` | Text input, style (heading/subheading/body/caption) |
| `entity_list` | Entity type multi-select |
| `timeline` | Show updates toggle, show scheduled toggle, max items |
| `status_badge` | No config (explanation text) |
| `divider` | No config |
| `map_snippet` | No config |
| `action_buttons` | No config |

### Spacing picker

Moved to toolbar area as small dropdown/segmented control next to edit mode toggle. Changes apply live.

### Delete flow

Tap 🗑 in floating toolbar or config drawer → confirmation dialog ("Remove this block?" with Cancel / Remove) → block removed, drawer closes, undo available.

---

## 9. What Gets Removed

| Component | Replaced by |
|---|---|
| `BlockList.tsx` | `EditableLayoutRenderer` |
| `BlockListItem.tsx` | `EditableBlock` |
| `BlockConfigPanel.tsx` | `ConfigDrawer` |
| `SpacingPicker.tsx` (standalone) | Toolbar control |
| "Build" tab (mobile) | Edit mode toggle |
| "Row" palette item | Auto-row via side-drop |
| Builder left panel (desktop) | Vertical sidebar + centered preview |
