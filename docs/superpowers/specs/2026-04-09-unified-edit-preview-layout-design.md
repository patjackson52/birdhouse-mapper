# Unified Edit/Preview Layout Design

## Problem

The Layout Builder's right panel has separate Edit (Build) and Preview modes that look different. The Build tab shows a block list editor, while the Detail Preview tab shows the rendered layout. This disconnect makes it hard to understand what you're editing — the build UI bears no visual resemblance to the final output.

## Goal

Make the Edit and Preview modes visually identical. Both render the detail preview layout (bottom-sheet style card with icon, title, fields, same padding/background). The only differences:

- **Edit mode**: clicking a block highlights it and scrolls to its config in the left Build panel
- **Preview mode**: no highlights, no selection, fields are interactive (dropdowns open, inputs accept text)

## Approach

Extend `LayoutRenderer` with an `'edit'` mode. Each block gets a clickable wrapper in edit mode for selection/highlighting. The right panel always renders the detail preview layout, toggling between `mode="edit"` and `mode="preview"`.

## Design

### LayoutRenderer Changes

Add new optional props to `LayoutRendererProps`:

- `selectedBlockId?: string` — the currently selected block
- `onBlockSelect?: (blockId: string | null) => void` — callback when a block is tapped

Add `'edit'` as a valid value for the existing `mode` prop.

In the `renderBlock` function, when `mode === 'edit'`:
- Wrap each block's output in a clickable `<div>` that calls `onBlockSelect(block.id)` on click
- When `block.id === selectedBlockId`, apply a highlight ring (`ring-2 ring-forest/40 rounded`)
- Use `cursor-pointer` on all block wrappers
- Clicking the already-selected block deselects it (`onBlockSelect(null)`)

In `mode === 'preview'`:
- No wrapper, no selection — identical to current behavior

Block components themselves do not change. The wrapper in `renderBlock` handles all selection logic.

### LayoutBuilder — State Changes

Lift `selectedBlockId` to `LayoutBuilder` state:

```ts
const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
const [rightPanelMode, setRightPanelMode] = useState<'edit' | 'preview'>('edit');
```

When `rightPanelMode` changes to `'preview'`, clear `selectedBlockId`.

Pass `selectedBlockId` down to both the right panel's `LayoutRenderer` and the left panel's `BlockList`, so selection is bidirectional.

### Right Panel — Unified View

Replace the current `detailPreview` / `formPreviewContent` split with a single unified view. The right panel always renders:

```
┌─ gray-100 outer container, rounded-xl, p-3 ─────────┐
│ ┌─ white card, rounded-t-2xl, shadow-lg ───────────┐ │
│ │  [handle bar]                                      │ │
│ │  [icon] [Item Name]                                │ │
│ │                                                    │ │
│ │  <LayoutRenderer                                   │ │
│ │    mode={rightPanelMode}                           │ │
│ │    selectedBlockId={selectedBlockId}               │ │
│ │    onBlockSelect={setSelectedBlockId}              │ │
│ │    ...                                             │ │
│ │  />                                                │ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Toggle at the top of the right panel switches between Edit and Preview:

```
[Edit] [Preview]
```

Styled the same as the current Detail/Form tab toggle (`px-3 py-1.5 rounded-md text-sm font-medium`, active: `bg-forest text-white`, inactive: `bg-sage-light text-forest-dark`).

### Left Panel — Scroll-to-Selection

`BlockList` receives a new prop: `selectedBlockId?: string`.

When `selectedBlockId` changes:
- Auto-expand the matching block's config in BlockList (set `expandedId` to match)
- Scroll the block's DOM element into view using `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`
- Use `useEffect` watching `selectedBlockId` + refs on each BlockListItem

When a block is expanded/clicked in BlockList, also update `selectedBlockId` in LayoutBuilder (bidirectional sync). BlockList receives `onBlockSelect` prop for this.

### Mobile Behavior

Tabs change from `Build | Detail | Form` to `Build | Edit | Preview`.

- **Build tab**: unchanged — BlockPalette, SpacingPicker, BlockList
- **Edit tab**: unified detail preview layout with `mode="edit"`. Tapping a block switches to Build tab with that block's config expanded
- **Preview tab**: unified detail preview layout with `mode="preview"`, fields interactive

### Form Preview

The Form Preview tab/functionality is removed from the right panel toggle. The unified view only shows the detail preview layout. If Form Preview is needed later, it can be re-added as a separate feature.

### What Gets Removed

- `DetailPreview` component is no longer used by LayoutBuilder (may still be used elsewhere)
- The `detailPreview` variable in LayoutBuilder
- The `formPreviewContent` variable and Form Preview tab in LayoutBuilder
- The `previewTab` state (`'detail' | 'form'`) — replaced by `rightPanelMode` (`'edit' | 'preview'`)
- Desktop: the Detail Preview / Form Preview tab toggle
- Mobile: the three-tab `build | detail | form` layout

### What Stays the Same

- All block components (StatusBadgeBlock, FieldDisplayBlock, etc.) — unchanged
- BlockPalette — unchanged
- SpacingPicker — unchanged
- The detail preview visual layout (gray outer, white card, handle, icon + title header)
- LayoutRenderer's existing `'live'` and `'preview'` modes
- All layout data structures and types

## Files Modified

1. **`src/components/layout/LayoutRenderer.tsx`** — add `'edit'` mode, `selectedBlockId`, `onBlockSelect` props, block wrapper logic
2. **`src/components/layout/builder/LayoutBuilder.tsx`** — lift `selectedBlockId` state, replace right panel with unified view, update tabs
3. **`src/components/layout/builder/BlockList.tsx`** — accept `selectedBlockId` and `onBlockSelect`, auto-expand and scroll-to on selection change
4. **`src/components/layout/builder/BlockListItem.tsx`** — add ref forwarding for scroll-to support
