# Top-Level Block Width & Alignment

**Date:** 2026-04-09
**Status:** Draft
**Branch:** `feature/layout-enhancements`

## Problem

The V2 layout system supports fractional widths (`1/4`, `1/3`, `1/2`, `2/3`, `3/4`) for blocks inside rows, but top-level blocks always render at full container width. Blocks like the status badge chip stretch across the entire detail view even though they only contain a few words. There is no way for admins to constrain the width of a standalone block or control its alignment.

## Solution

Expose the existing `width` property on top-level blocks (it already exists on `LayoutBlockV2` but is gated behind `isInRow` in the config panel). Add a new `align` property to control horizontal placement of width-constrained blocks.

## Data Model

### `LayoutBlockV2` (in `types-v2.ts`)

Add one optional field:

```ts
export type BlockAlign = 'start' | 'center' | 'end';

export interface LayoutBlockV2 {
  id: string;
  type: BlockTypeV2;
  config: BlockConfigV2;
  width?: FractionalWidth;      // existing — now used for top-level blocks too
  align?: BlockAlign;           // NEW — horizontal alignment when width < full
  hideWhenEmpty?: boolean;
  permissions?: BlockPermissions;
}
```

- `align` is only meaningful when `width` is set and not `'full'`.
- Omitting `align` means `'start'` (left-aligned).

### Zod Schema (in `schemas-v2.ts`)

Add `align` to the block schema:

```ts
const blockAlignSchema = z.enum(['start', 'center', 'end']).optional();
```

Add to `layoutBlockV2Schema`:

```ts
align: blockAlignSchema,
```

### Default Alignment by Block Type

All block types default to `'start'` (left). This is the natural reading direction for LTR content and matches existing behavior. Users can override per-block.

## Rendering

### `LayoutRendererV2.tsx`

When rendering a top-level block (not inside a `LayoutRowV2`) that has `width` set and `width !== 'full'`:

1. Compute `max-width` from the fractional width (reuse `widthToCSS` map from `RowBlockV2`).
2. Apply alignment via flexbox on a wrapper div:
   - `start`: default (no extra styles needed, block naturally left-aligns)
   - `center`: wrapper gets `display: flex; justify-content: center`
   - `end`: wrapper gets `display: flex; justify-content: flex-end`
3. Inner div gets `width: 100%; max-width: <computed>`.

**Mobile collapse:** When the container is narrow (bottom-sheet peek/half states, or container < 480px), ignore `width` and render full-width. This matches how `RowBlockV2` already collapses on narrow containers.

### `EditableLayoutRenderer.tsx`

Apply the same width/alignment rendering in the builder preview so admins see the effect in real time while editing.

## Config Panel

### `BlockConfigPanelV2.tsx`

Remove the `isInRow` gate on the `WidthPicker`. Show it for all blocks. When a non-full width is selected, show the `AlignPicker` below it.

Current code (line 287):
```tsx
{isInRow && onWidthChange && (
```

Change to:
```tsx
{onWidthChange && (
```

Add `AlignPicker` conditionally when `block.width && block.width !== 'full'`.

Also update the `Props` interface: change `onWidthChange` from optional to required (it was optional because it was only passed for in-row blocks). Add `onAlignChange`:

```ts
onWidthChange: (blockId: string, width: FractionalWidth) => void;
onAlignChange: (blockId: string, align: BlockAlign) => void;
```

Remove the `isInRow` prop entirely — it's no longer needed.

### `WidthPicker.tsx`

Add `'full'` to the options list so users can reset a block back to full width:

```ts
const OPTIONS: { value: FractionalWidth; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/3', label: '1/3' },
  { value: '1/2', label: '1/2' },
  { value: '2/3', label: '2/3' },
  { value: '3/4', label: '3/4' },
  { value: 'full', label: 'Full' },
];
```

### New: `AlignPicker.tsx`

A small component with three buttons: left, center, right. Same visual style as the existing `WidthPicker` (toggle buttons with `bg-forest` active state).

```tsx
interface Props {
  value: BlockAlign | undefined;
  onChange: (align: BlockAlign) => void;
}
```

Options use directional arrows or icons: `←  ↔  →` (or text labels "Left", "Center", "Right").

## Callback Plumbing

### `LayoutEditor.tsx`

Add an `onAlignChange` handler alongside the existing `onWidthChange`:

```ts
function handleAlignChange(blockId: string, align: BlockAlign) {
  // Update block's align property in layout state
}
```

Pass `onAlignChange` down through `ConfigDrawer` → `BlockConfigPanelV2`.

## Mobile UX

- The WidthPicker and AlignPicker render in the config drawer, which already handles mobile via the slide-up drawer. No special mobile treatment needed for the controls.
- Width constraints are ignored when container < 480px (blocks go full-width). This prevents tiny blocks on phone screens.

## Scope Boundaries

**In scope:**
- Width picker for all blocks (top-level and in-row)
- Alignment picker for width-constrained blocks
- Live preview in editor
- Rendering in detail view

**Out of scope:**
- Custom pixel widths (fractions only)
- Per-block responsive breakpoints
- Drag-to-resize handles
- Row-level alignment controls
