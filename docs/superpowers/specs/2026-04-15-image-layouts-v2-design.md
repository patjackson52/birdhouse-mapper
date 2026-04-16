# Image Layouts v2 — Design Spec

**Date:** 2026-04-15
**Issue context:** Extends PR #251 (image layout support in knowledge editor)
**Scope:** Solid foundations + drag-to-resize + smart grids. No new novel layout types.

## Goals

1. Drag-to-resize images with percentage-based snap points
2. Replace `ImageRow` with a proper `ImageGrid` supporting 1-4 columns with aspect-ratio heights
3. Correct text flow: floats wrap text, block layouts break flow
4. Progressive mobile collapse so field tablets render content well

## Non-goals

- Gallery lightbox / click-to-expand
- Masonry layouts
- Inline-small / pull-quote style layouts
- Freeform pixel-based sizing

---

## 1. Data Model

### VaultImage — new attribute

| Attribute | Type | Default | Storage |
|-----------|------|---------|---------|
| `widthPercent` | `number \| null` | `null` | `data-width-percent` on `<figure>` |

- Snap values: 25, 33, 50, 66, 75, 100
- `null` means "use layout-specific default" (40% for floats, 80% for centered, 100% for full-width/default)

Existing attributes unchanged: `src`, `alt`, `title`, `vaultItemId`, `layout`, `caption`.

### ImageGrid — replaces ImageRow

| Attribute | Type | Default | Storage |
|-----------|------|---------|---------|
| `columns` | `2 \| 3 \| 4` | `2` | `data-columns` on container `<div>` |

- Node name: `imageGrid` (internal TipTap name)
- Content: `vaultImage+` (unchanged from imageRow)
- Group: `block`
- Rendered as: `<div data-type="image-grid" data-columns="N" class="image-grid">`
- ParseHTML matches both `div[data-type="image-row"]` (backward compat) and `div[data-type="image-grid"]`

### No database migration

All attributes are stored within the TipTap JSON document field. No schema changes needed.

---

## 2. Drag-to-Resize Interaction

### Resize handle

A vertical drag bar on the right edge of selected images (left edge for float-right). Only visible in editor mode, not in read-only/published view.

### Implementation: TipTap NodeView

Switch VaultImage from `renderHTML`-only to a React NodeView. This is required because `renderHTML` cannot attach event handlers.

The NodeView renders:
- `<figure>` wrapper with layout/width styles
- `<img>` element
- Optional `<figcaption>`
- Resize handle `<div>` (editor mode only)

The existing `renderHTML` method stays for HTML export/serialization (copy-paste, `generateHTML`).

### Drag behavior

1. `mousedown` on handle starts tracking
2. `mousemove` calculates width as percentage of editor container width
3. Snap to nearest of [25, 33, 50, 66, 75, 100] — always snaps, no freeform values
4. Visual guide shows snap target during drag (faint line + percentage label)
5. `mouseup` commits `widthPercent` via `updateAttributes`

### Snap function

```typescript
const SNAP_POINTS = [25, 33, 50, 66, 75, 100];

function snapToPercent(raw: number): number {
  const clamped = Math.max(25, Math.min(100, raw));
  return SNAP_POINTS.reduce((prev, curr) =>
    Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
  );
}
```

Always snaps to the nearest point — no arbitrary intermediate values allowed.

### Grid images

No individual resize inside grids. Images fill their column equally. Grid column count is controlled from the toolbar.

---

## 3. CSS and Text Flow

### Float layouts (text flows beside image)

```css
.image-figure[data-layout="float-left"] {
  float: left;
  margin: 0 1rem 1rem 0;
  /* width set via inline style from widthPercent; default 40% when null */
}

.image-figure[data-layout="float-right"] {
  float: right;
  margin: 0 0 1rem 1rem;
  /* width set via inline style from widthPercent; default 40% when null */
}
```

Remove hardcoded `max-width: 40%`. Width comes from `widthPercent` attribute as an inline `width: N%` style. When `widthPercent` is null, the NodeView applies `width: 40%` as the float default.

Clearfix unchanged (`.ProseMirror::after`, `.knowledge-body::after`).

### Block layouts (break text flow)

| Layout | Width behavior |
|--------|---------------|
| `default` | `widthPercent` or 100% |
| `centered` | `margin: auto`, `widthPercent` or 80% |
| `full-width` | Always 100%, ignores `widthPercent` |

### Image grid CSS

```css
.image-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), 1fr);
  gap: 0.5rem;
  margin: 1rem 0;
}

.image-grid .image-figure {
  margin: 0;
}

.image-grid .image-figure img {
  width: 100%;
  aspect-ratio: auto;
  object-fit: cover;
  border-radius: 4px;
}
```

`--grid-cols` set via inline style from the `columns` attribute. No fixed `height: 200px`.

### Backward compatibility

`.image-row` aliased to `.image-grid` styles:

```css
.image-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin: 1rem 0;
}
```

Existing saved content with `data-type="image-row"` renders correctly without migration.

### Responsive breakpoints (progressive collapse)

```css
/* Minimum width guard */
.image-figure[data-layout="float-left"],
.image-figure[data-layout="float-right"] {
  min-width: 150px;
}

/* Tablet: 4-col grids collapse to 2 */
@media (max-width: 768px) {
  .image-grid { --grid-cols: 2 !important; }
}

/* Phone: all grids single column, floats become block */
@media (max-width: 480px) {
  .image-grid { --grid-cols: 1 !important; }

  .image-figure[data-layout="float-left"],
  .image-figure[data-layout="float-right"] {
    float: none;
    width: 100% !important;
    margin: 1rem 0;
  }
}
```

When a float image's computed pixel width drops below 150px (the `min-width` guard), the browser naturally expands it, and at 480px the media query takes over completely.

---

## 4. Toolbar Updates

The ImageToolbar (`ImageBubbleMenu.tsx`) remains a single contextual toolbar. Updated sections:

### Layout buttons
Same 5 options, same icons. No change.

### Width picker (new)
Row of small buttons: `25%` `33%` `50%` `66%` `75%` `100%`. Active state highlights current width. Hidden when layout is `full-width`.

Provides keyboard/click access to the same values the drag handle sets.

### Caption input
No change.

### Grid controls (replaces row controls)

| Context | Controls shown |
|---------|---------------|
| Image NOT in a grid | "Create Grid" button |
| Image IS in a grid | Column picker (`2` `3` `4` buttons) + "Add Image" button + "Unwrap Grid" button |

- "Create Grid" wraps the selected image in an `imageGrid` node (replaces "Create Row")
- Column picker updates the `columns` attribute on the parent `imageGrid`
- "Add Image" inserts a new empty vaultImage into the grid
- "Unwrap Grid" lifts images back to standalone block-level nodes

---

## 5. Testing Strategy

### Unit tests (Vitest)

- **VaultImage extension:** `widthPercent` attribute — default null, parseHTML reads `data-width-percent`, renderHTML outputs it, snap values round-trip
- **ImageGrid extension:** `columns` attribute (default 2), parseHTML handles both `data-type="image-row"` and `data-type="image-grid"`, `wrapInImageGrid` command, column count update
- **Snap logic:** Pure function `snapToPercent` — threshold tests (48% → 50%, boundary between 33% and 50%), edge cases at 25% and 100%

### Component tests (Vitest + testing-library)

- **ImageToolbar:** Width picker shows/hides based on layout, grid controls appear when inside grid, column buttons update attribute
- **VaultImage NodeView:** Resize handle renders in editable mode, hidden in read-only

### CSS / visual (Playwright E2E)

- Float text flow at different widths
- Grid column rendering at 2/3/4
- Responsive collapse at breakpoints (Playwright viewport resize)
- Backward compat: content with `image-row` class renders as grid

### Skipped

No pixel-perfect visual regression for drag interaction — too brittle. Snap logic tested as pure function, attribute commitment tested via extension tests.

---

## 6. File Changes Summary

| File | Change |
|------|--------|
| `src/lib/editor/VaultImageExtension.ts` | Add `widthPercent` attribute, keep `renderHTML` for serialization |
| `src/lib/editor/VaultImageNodeView.tsx` | New — React NodeView with resize handle |
| `src/lib/editor/ImageRowExtension.ts` | Rename to `ImageGridExtension.ts`, add `columns` attr, backward-compat parsing |
| `src/lib/editor/ImageBubbleMenu.tsx` | Add width picker, replace row controls with grid controls |
| `src/lib/editor/RichTextEditor.tsx` | Register NodeView, swap ImageRow → ImageGrid in extensions |
| `src/lib/editor/resize-utils.ts` | New — `snapToPercent` pure function |
| `src/styles/globals.css` | Replace `.image-row` styles with `.image-grid`, responsive breakpoints, remove fixed height |
| `src/lib/editor/__tests__/VaultImageExtension.test.ts` | Add `widthPercent` tests |
| `src/lib/editor/__tests__/ImageGridExtension.test.ts` | New — grid node tests |
| `src/lib/editor/__tests__/resize-utils.test.ts` | New — snap function tests |
| `src/lib/editor/__tests__/ImageToolbar.test.tsx` | New — toolbar component tests |
