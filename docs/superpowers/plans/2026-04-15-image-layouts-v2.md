# Image Layouts v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-resize with percentage snap points, replace ImageRow with a smart ImageGrid (1-4 columns, aspect-ratio heights), and implement progressive mobile collapse.

**Architecture:** TipTap NodeView for interactive resize handles on VaultImage, new ImageGrid node replacing ImageRow with backward-compat parsing, CSS grid with responsive breakpoints. All data stored in TipTap JSON — no database migration.

**Tech Stack:** TipTap 3.x (NodeView React), Vitest + testing-library, Tailwind CSS + vanilla CSS for grid/float layout.

---

### Task 1: Snap utility — pure function

**Files:**
- Create: `src/lib/editor/resize-utils.ts`
- Create: `src/lib/editor/__tests__/resize-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/editor/__tests__/resize-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { snapToPercent, SNAP_POINTS } from '../resize-utils';

describe('snapToPercent', () => {
  it('snaps 48 to 50', () => {
    expect(snapToPercent(48)).toBe(50);
  });

  it('snaps 52 to 50', () => {
    expect(snapToPercent(52)).toBe(50);
  });

  it('snaps 30 to 33', () => {
    expect(snapToPercent(30)).toBe(33);
  });

  it('snaps 70 to 66', () => {
    expect(snapToPercent(70)).toBe(66);
  });

  it('clamps below 25 to 25', () => {
    expect(snapToPercent(10)).toBe(25);
  });

  it('clamps above 100 to 100', () => {
    expect(snapToPercent(120)).toBe(100);
  });

  it('snaps exact values to themselves', () => {
    for (const pt of SNAP_POINTS) {
      expect(snapToPercent(pt)).toBe(pt);
    }
  });

  it('snaps boundary between 33 and 50 correctly', () => {
    // Midpoint is 41.5 — 41 should snap to 33, 42 should snap to 50
    expect(snapToPercent(41)).toBe(33);
    expect(snapToPercent(42)).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/editor/__tests__/resize-utils.test.ts`
Expected: FAIL — module `../resize-utils` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/editor/resize-utils.ts`:

```typescript
export const SNAP_POINTS = [25, 33, 50, 66, 75, 100] as const;

export type SnapPoint = (typeof SNAP_POINTS)[number];

/**
 * Default width percentages when widthPercent is null, keyed by layout.
 */
export const LAYOUT_WIDTH_DEFAULTS: Record<string, number> = {
  'default': 100,
  'float-left': 40,
  'float-right': 40,
  'centered': 80,
  'full-width': 100,
};

/**
 * Snap a raw percentage to the nearest allowed snap point.
 * Always returns a valid snap value — no freeform intermediate widths.
 */
export function snapToPercent(raw: number): SnapPoint {
  const clamped = Math.max(25, Math.min(100, raw));
  return SNAP_POINTS.reduce((prev, curr) =>
    Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
  ) as SnapPoint;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/editor/__tests__/resize-utils.test.ts`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/resize-utils.ts src/lib/editor/__tests__/resize-utils.test.ts
git commit -m "feat: add snapToPercent utility for image resize snap points"
```

---

### Task 2: VaultImage — add widthPercent attribute

**Files:**
- Modify: `src/lib/editor/VaultImageExtension.ts`
- Modify: `src/lib/editor/__tests__/VaultImageExtension.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to the existing `src/lib/editor/__tests__/VaultImageExtension.test.ts`:

```typescript
describe('VaultImageExtension - widthPercent attribute', () => {
  it('defaults widthPercent to null', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    const imgNode = findVaultImage(editor.getJSON());
    expect(imgNode?.attrs?.widthPercent).toBeNull();
    editor.destroy();
  });

  it('parses data-width-percent from figure', () => {
    const editor = createEditor(
      '<figure data-width-percent="50"><img src="a.jpg" /></figure>'
    );
    const json = editor.getJSON();
    const imgNode = json.content?.find((n) => n.type === 'vaultImage');
    expect(imgNode?.attrs?.widthPercent).toBe(50);
    editor.destroy();
  });

  it('renders widthPercent as data-width-percent on figure', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: 66 },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).toContain('data-width-percent="66"');
  });

  it('does not render data-width-percent when null', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'vaultImage',
        attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null },
      }],
    };
    const html = generateHTML(json, baseExtensions);
    expect(html).not.toContain('data-width-percent');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/editor/__tests__/VaultImageExtension.test.ts`
Expected: FAIL — `widthPercent` not in attrs, `data-width-percent` not in HTML output

- [ ] **Step 3: Add widthPercent attribute to VaultImageExtension**

In `src/lib/editor/VaultImageExtension.ts`, add to the `addAttributes()` return object, after the `caption` attribute:

```typescript
      widthPercent: {
        default: null as number | null,
        parseHTML: (element) => {
          const fig = element.closest?.('figure');
          const raw = fig?.getAttribute('data-width-percent') ?? element.getAttribute('data-width-percent');
          return raw ? Number(raw) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.widthPercent == null) return {};
          return { 'data-width-percent': String(attributes.widthPercent) };
        },
      },
```

Also add `'data-width-percent': widthPercent,` to the destructuring in `renderHTML()` and pass it to `figureAttrs`:

Replace the `renderHTML` method:

```typescript
  renderHTML({ HTMLAttributes }) {
    const {
      'data-layout': layout,
      'data-caption': caption,
      'data-width-percent': widthPercent,
      ...imgAttrs
    } = HTMLAttributes;

    const figureAttrs: Record<string, string> = { class: 'image-figure' };
    if (layout && layout !== 'default') figureAttrs['data-layout'] = layout;
    if (widthPercent) figureAttrs['data-width-percent'] = widthPercent;

    if (caption) {
      return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)], ['figcaption', {}, caption]];
    }
    return ['figure', figureAttrs, ['img', mergeAttributes(imgAttrs)]];
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/editor/__tests__/VaultImageExtension.test.ts`
Expected: PASS — all 11 tests (7 existing + 4 new)

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: PASS — no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/VaultImageExtension.ts src/lib/editor/__tests__/VaultImageExtension.test.ts
git commit -m "feat: add widthPercent attribute to VaultImage extension"
```

---

### Task 3: ImageGrid extension — replace ImageRow

**Files:**
- Create: `src/lib/editor/ImageGridExtension.ts`
- Create: `src/lib/editor/__tests__/ImageGridExtension.test.ts`
- Modify: `src/lib/editor/extensions.ts` (swap ImageRow → ImageGrid)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/editor/__tests__/ImageGridExtension.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { generateHTML } from '@tiptap/html';
import { VaultImage } from '../VaultImageExtension';
import { ImageGrid } from '../ImageGridExtension';

const extensions = [Document, Paragraph, Text, VaultImage, ImageGrid];

function createEditor(content?: string) {
  return new Editor({
    extensions,
    content: content ?? '<p>Hello</p>',
  });
}

describe('ImageGridExtension', () => {
  it('defaults columns to 2', () => {
    const editor = createEditor(
      '<div data-type="image-grid"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    expect(grid?.attrs?.columns).toBe(2);
    editor.destroy();
  });

  it('parses data-columns attribute', () => {
    const editor = createEditor(
      '<div data-type="image-grid" data-columns="3"><img src="a.jpg" /><img src="b.jpg" /><img src="c.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid?.attrs?.columns).toBe(3);
    editor.destroy();
  });

  it('parses legacy data-type="image-row" for backward compat', () => {
    const editor = createEditor(
      '<div data-type="image-row"><img src="a.jpg" /><img src="b.jpg" /></div>'
    );
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    expect(grid?.content).toHaveLength(2);
    editor.destroy();
  });

  it('renders as data-type="image-grid" with data-columns', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'imageGrid',
        attrs: { columns: 3 },
        content: [
          { type: 'vaultImage', attrs: { src: 'a.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null } },
          { type: 'vaultImage', attrs: { src: 'b.jpg', alt: null, title: null, vaultItemId: null, layout: 'default', caption: null, widthPercent: null } },
        ],
      }],
    };
    const html = generateHTML(json, extensions);
    expect(html).toContain('data-type="image-grid"');
    expect(html).toContain('data-columns="3"');
    expect(html).toContain('image-grid');
  });

  it('wrapInImageGrid command wraps selected image', () => {
    const editor = createEditor('<p><img src="a.jpg" /></p>');
    // Select the image node
    const imgPos = editor.state.doc.resolve(1);
    editor.commands.setNodeSelection(imgPos.pos);
    const result = editor.chain().focus().wrapInImageGrid().run();
    expect(result).toBe(true);
    const json = editor.getJSON();
    const grid = json.content?.find((n) => n.type === 'imageGrid');
    expect(grid).toBeDefined();
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/editor/__tests__/ImageGridExtension.test.ts`
Expected: FAIL — module `../ImageGridExtension` not found

- [ ] **Step 3: Create ImageGridExtension**

Create `src/lib/editor/ImageGridExtension.ts`:

```typescript
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGrid: {
      wrapInImageGrid: () => ReturnType;
      setGridColumns: (columns: number) => ReturnType;
      unwrapImageGrid: () => ReturnType;
    };
  }
}

/**
 * ImageGrid: block node that holds 1+ vaultImage nodes displayed in a CSS grid.
 * Supports 2-4 columns with aspect-ratio-based image heights.
 * Backward-compatible: parses legacy data-type="image-row" content.
 */
export const ImageGrid = Node.create({
  name: 'imageGrid',
  group: 'block',
  content: 'vaultImage+',
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-columns');
          return raw ? Number(raw) : 2;
        },
        renderHTML: (attributes) => {
          return { 'data-columns': String(attributes.columns) };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="image-grid"]' },
      { tag: 'div[data-type="image-row"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { 'data-columns': columns, ...rest } = HTMLAttributes;
    return [
      'div',
      mergeAttributes(rest, {
        'data-type': 'image-grid',
        'data-columns': columns,
        class: 'image-grid',
        style: `--grid-cols: ${columns}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      wrapInImageGrid:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const node = state.doc.nodeAt(selection.from);
          if (!node || node.type.name !== 'vaultImage') return false;

          if (dispatch) {
            const pos = selection.$from.before();
            const gridType = state.schema.nodes.imageGrid;
            const gridNode = gridType.create({ columns: 2 }, [node]);
            const tr = state.tr.replaceWith(pos, pos + node.nodeSize, gridNode);
            dispatch(tr);
          }
          return true;
        },

      setGridColumns:
        (columns: number) =>
        ({ state, dispatch }) => {
          const { selection } = state;
          // Walk up to find imageGrid parent
          for (let d = selection.$from.depth; d > 0; d--) {
            const parentNode = selection.$from.node(d);
            if (parentNode.type.name === 'imageGrid') {
              if (dispatch) {
                const pos = selection.$from.before(d);
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                  ...parentNode.attrs,
                  columns,
                });
                dispatch(tr);
              }
              return true;
            }
          }
          return false;
        },

      unwrapImageGrid:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          for (let d = selection.$from.depth; d > 0; d--) {
            const parentNode = selection.$from.node(d);
            if (parentNode.type.name === 'imageGrid') {
              if (dispatch) {
                const pos = selection.$from.before(d);
                const children: typeof parentNode[] = [];
                parentNode.forEach((child) => children.push(child));
                const tr = state.tr.replaceWith(
                  pos,
                  pos + parentNode.nodeSize,
                  children
                );
                dispatch(tr);
              }
              return true;
            }
          }
          return false;
        },
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/editor/__tests__/ImageGridExtension.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Swap ImageRow → ImageGrid in extensions.ts**

Replace `src/lib/editor/extensions.ts`:

```typescript
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { VaultImage } from './VaultImageExtension';
import { LineHeight } from './LineHeightExtension';
import { ImageGrid } from './ImageGridExtension';

export function getEditorExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    VaultImage,
    ImageGrid,
    LineHeight,
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing…',
    }),
  ];
}
```

- [ ] **Step 6: Run all editor tests to verify nothing breaks**

Run: `npx vitest run src/lib/editor/__tests__/`
Expected: PASS — all tests in all editor test files

- [ ] **Step 7: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/ImageGridExtension.ts src/lib/editor/__tests__/ImageGridExtension.test.ts src/lib/editor/extensions.ts
git commit -m "feat: replace ImageRow with ImageGrid supporting 2-4 columns"
```

---

### Task 4: CSS — grid styles, responsive breakpoints, backward compat

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Replace image layout CSS**

In `src/styles/globals.css`, replace the entire `/* ── Image layouts */` section (lines 132-196) with:

```css
/* ── Image layouts ─────────────────────────────────────────────────────── */
.image-figure {
  display: block;
  margin: 1rem 0;
}

.image-figure[data-layout="float-left"] {
  float: left;
  margin: 0 1rem 1rem 0;
  min-width: 150px;
  /* width set via inline style from widthPercent; default 40% when null */
}

.image-figure[data-layout="float-right"] {
  float: right;
  margin: 0 0 1rem 1rem;
  min-width: 150px;
  /* width set via inline style from widthPercent; default 40% when null */
}

.image-figure[data-layout="centered"] {
  display: block;
  margin-left: auto;
  margin-right: auto;
  /* width set via inline style from widthPercent; default 80% when null */
}

.image-figure[data-layout="full-width"] {
  width: 100%;
  max-width: 100%;
}

.image-figure figcaption {
  text-align: center;
  font-size: 0.8em;
  color: var(--color-muted);
  margin-top: 0.4em;
  font-style: italic;
}

/* Image grids */
.image-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 2), 1fr);
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

/* Backward compat: legacy image-row renders as 2-col grid */
.image-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin: 1rem 0;
}

.image-row .image-figure {
  margin: 0;
}

.image-row .image-figure img {
  width: 100%;
  aspect-ratio: auto;
  object-fit: cover;
  border-radius: 4px;
}

/* Clearfix after floated images */
.ProseMirror::after,
.knowledge-body::after {
  content: '';
  display: table;
  clear: both;
}

/* Responsive: tablet */
@media (max-width: 768px) {
  .image-grid[style*="--grid-cols: 4"],
  .image-grid[style*="--grid-cols:4"] {
    --grid-cols: 2 !important;
  }
}

/* Responsive: phone */
@media (max-width: 480px) {
  .image-grid {
    --grid-cols: 1 !important;
  }

  .image-figure[data-layout="float-left"],
  .image-figure[data-layout="float-right"] {
    float: none;
    width: 100% !important;
    margin: 1rem 0;
  }
}
```

- [ ] **Step 2: Run build to verify CSS parses correctly**

Run: `npm run build`
Expected: PASS — no CSS parse errors

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: CSS grid layouts, responsive breakpoints, backward-compat image-row"
```

---

### Task 5: VaultImage NodeView — React component with resize handle

**Files:**
- Create: `src/lib/editor/VaultImageNodeView.tsx`
- Modify: `src/lib/editor/VaultImageExtension.ts` (register NodeView)

- [ ] **Step 1: Create the NodeView component**

Create `src/lib/editor/VaultImageNodeView.tsx`:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { snapToPercent, LAYOUT_WIDTH_DEFAULTS } from './resize-utils';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

/**
 * React NodeView for VaultImage. Renders the figure/img/figcaption structure
 * with an interactive resize handle in editor mode.
 */
export function VaultImageNodeView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const { src, alt, title, layout, caption, widthPercent } = node.attrs;
  const figureRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewPercent, setPreviewPercent] = useState<number | null>(null);

  const effectiveLayout = (layout as ImageLayout) || 'default';
  const effectiveWidth = widthPercent ?? LAYOUT_WIDTH_DEFAULTS[effectiveLayout] ?? 100;
  const isEditable = editor.isEditable;
  const isFullWidth = effectiveLayout === 'full-width';
  const isInsideGrid = editor.isActive('imageGrid');

  // Width style: grids control their own sizing, full-width is always 100%
  const widthStyle = isInsideGrid || isFullWidth ? undefined : `${dragging && previewPercent ? previewPercent : effectiveWidth}%`;

  // Float-right handle goes on left edge; all others on right edge
  const handleSide = effectiveLayout === 'float-right' ? 'left' : 'right';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);

      const editorEl = editor.view.dom.closest('.ProseMirror')?.parentElement;
      if (!editorEl) return;
      const containerWidth = editorEl.clientWidth;

      function onMouseMove(ev: MouseEvent) {
        if (!figureRef.current) return;
        const rect = figureRef.current.getBoundingClientRect();
        let rawPercent: number;

        if (handleSide === 'right') {
          rawPercent = ((ev.clientX - rect.left) / containerWidth) * 100;
        } else {
          rawPercent = ((rect.right - ev.clientX) / containerWidth) * 100;
        }

        setPreviewPercent(snapToPercent(rawPercent));
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setDragging(false);
        setPreviewPercent((current) => {
          if (current != null) {
            updateAttributes({ widthPercent: current });
          }
          return null;
        });
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editor, handleSide, updateAttributes]
  );

  // Build figure class and data attributes to match renderHTML output
  const figureClasses = ['image-figure'];
  const dataAttrs: Record<string, string> = {};
  if (effectiveLayout !== 'default') dataAttrs['data-layout'] = effectiveLayout;
  if (widthPercent != null) dataAttrs['data-width-percent'] = String(widthPercent);

  return (
    <NodeViewWrapper
      as="figure"
      ref={figureRef}
      className={figureClasses.join(' ')}
      style={widthStyle ? { width: widthStyle } : undefined}
      {...dataAttrs}
    >
      <img src={src} alt={alt || ''} title={title || undefined} draggable={false} />

      {caption && <figcaption>{caption}</figcaption>}

      {/* Resize handle — only in editor mode, not inside grids, not full-width */}
      {isEditable && selected && !isInsideGrid && !isFullWidth && (
        <>
          <div
            className="vault-image-resize-handle"
            data-side={handleSide}
            onMouseDown={handleMouseDown}
            title={`Drag to resize (${dragging && previewPercent ? previewPercent : effectiveWidth}%)`}
          />
          {dragging && previewPercent != null && (
            <div className="vault-image-resize-guide">
              {previewPercent}%
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Add resize handle CSS to globals.css**

Append to the image layouts section in `src/styles/globals.css`, before the responsive media queries:

```css
/* Resize handle */
.vault-image-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.image-figure:hover .vault-image-resize-handle,
.vault-image-resize-handle:active {
  opacity: 1;
}

.vault-image-resize-handle[data-side="right"] {
  right: -4px;
}

.vault-image-resize-handle[data-side="left"] {
  left: -4px;
}

.vault-image-resize-guide {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
}

/* Make figure position relative for handle positioning */
.image-figure {
  position: relative;
}
```

- [ ] **Step 3: Register NodeView in VaultImageExtension**

In `src/lib/editor/VaultImageExtension.ts`, add the `addNodeView` method. Add the import at the top:

```typescript
import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VaultImageNodeView } from './VaultImageNodeView';
```

Then add `addNodeView()` to the extension (after `addAttributes()`):

```typescript
  addNodeView() {
    return ReactNodeViewRenderer(VaultImageNodeView);
  },
```

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Run all editor tests**

Run: `npx vitest run src/lib/editor/__tests__/`
Expected: PASS — all tests. The existing `renderHTML` tests still work because `renderHTML` is kept for serialization. The NodeView is used only in the live editor.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/VaultImageNodeView.tsx src/lib/editor/VaultImageExtension.ts src/styles/globals.css
git commit -m "feat: VaultImage NodeView with drag-to-resize handle"
```

---

### Task 6: Toolbar — width picker and grid controls

**Files:**
- Modify: `src/lib/editor/ImageBubbleMenu.tsx`
- Create: `src/lib/editor/__tests__/ImageToolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/editor/__tests__/ImageToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageToolbar } from '../ImageBubbleMenu';
import { SNAP_POINTS } from '../resize-utils';

function mockEditor(overrides: {
  isActive?: (name: string) => boolean;
  getAttributes?: (name: string) => Record<string, any>;
  chain?: () => any;
}) {
  const chainFns = {
    focus: () => chainFns,
    updateAttributes: () => chainFns,
    wrapInImageGrid: () => chainFns,
    setGridColumns: () => chainFns,
    unwrapImageGrid: () => chainFns,
    run: () => true,
  };

  return {
    isActive: overrides.isActive ?? ((name: string) => name === 'vaultImage'),
    getAttributes: overrides.getAttributes ?? (() => ({ layout: 'default', caption: '', widthPercent: null })),
    chain: overrides.chain ?? (() => chainFns),
  } as any;
}

describe('ImageToolbar', () => {
  it('shows width picker buttons', () => {
    const editor = mockEditor({});
    render(<ImageToolbar editor={editor} />);
    for (const pt of SNAP_POINTS) {
      expect(screen.getByRole('button', { name: `${pt}%` })).toBeDefined();
    }
  });

  it('hides width picker when layout is full-width', () => {
    const editor = mockEditor({
      getAttributes: () => ({ layout: 'full-width', caption: '', widthPercent: null }),
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.queryByRole('button', { name: '50%' })).toBeNull();
  });

  it('shows "Create Grid" when not inside a grid', () => {
    const editor = mockEditor({
      isActive: (name: string) => name === 'vaultImage',
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.getByRole('button', { name: /Create Grid/i })).toBeDefined();
  });

  it('shows column picker and Unwrap when inside a grid', () => {
    const editor = mockEditor({
      isActive: (name: string) => name === 'vaultImage' || name === 'imageGrid',
    });
    render(<ImageToolbar editor={editor} />);
    expect(screen.getByRole('button', { name: '2' })).toBeDefined();
    expect(screen.getByRole('button', { name: '3' })).toBeDefined();
    expect(screen.getByRole('button', { name: '4' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Unwrap Grid/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/editor/__tests__/ImageToolbar.test.tsx`
Expected: FAIL — no width picker or grid controls rendered yet

- [ ] **Step 3: Update ImageBubbleMenu.tsx**

Replace `src/lib/editor/ImageBubbleMenu.tsx`:

```tsx
'use client';

import type { Editor } from '@tiptap/core';
import { SNAP_POINTS } from './resize-utils';

type ImageLayout = 'default' | 'float-left' | 'float-right' | 'centered' | 'full-width';

interface ImageToolbarProps {
  editor: Editor;
  onAddImageToGrid?: () => void;
}

const LAYOUT_OPTIONS: { value: ImageLayout; label: string; icon: string }[] = [
  { value: 'default', label: 'Default', icon: '□' },
  { value: 'float-left', label: 'Float Left', icon: '◧' },
  { value: 'float-right', label: 'Float Right', icon: '◨' },
  { value: 'centered', label: 'Center', icon: '◫' },
  { value: 'full-width', label: 'Full Width', icon: '▬' },
];

/**
 * Contextual toolbar that appears when a vaultImage node is selected.
 * Shows layout toggles, width picker, caption input, and grid controls.
 */
export function ImageToolbar({ editor, onAddImageToGrid }: ImageToolbarProps) {
  if (!editor.isActive('vaultImage')) return null;

  const isInsideGrid = editor.isActive('imageGrid');
  const currentLayout = (editor.getAttributes('vaultImage').layout as ImageLayout) ?? 'default';
  const currentCaption = (editor.getAttributes('vaultImage').caption as string) ?? '';
  const currentWidth = (editor.getAttributes('vaultImage').widthPercent as number | null);
  const isFullWidth = currentLayout === 'full-width';

  function setLayout(layout: ImageLayout) {
    editor.chain().focus().updateAttributes('vaultImage', { layout }).run();
  }

  function setCaption(caption: string) {
    editor.chain().updateAttributes('vaultImage', { caption: caption || null }).run();
  }

  function setWidth(widthPercent: number) {
    editor.chain().focus().updateAttributes('vaultImage', { widthPercent }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sage-light bg-parchment">
      {/* Layout buttons */}
      <span className="text-xs text-forest-dark/50 mr-1">Layout:</span>
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => setLayout(opt.value)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            currentLayout === opt.value
              ? 'bg-sage text-white'
              : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
          }`}
        >
          {opt.icon} <span className="text-xs">{opt.label}</span>
        </button>
      ))}

      {/* Width picker — hidden for full-width layout */}
      {!isFullWidth && (
        <>
          <div className="w-px bg-sage-light mx-1 self-stretch" />
          <span className="text-xs text-forest-dark/50 mr-1">Width:</span>
          {SNAP_POINTS.map((pt) => (
            <button
              key={pt}
              type="button"
              aria-label={`${pt}%`}
              onClick={() => setWidth(pt)}
              className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                currentWidth === pt
                  ? 'bg-sage text-white'
                  : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
              }`}
            >
              {pt}%
            </button>
          ))}
        </>
      )}

      <div className="w-px bg-sage-light mx-1 self-stretch" />

      {/* Caption input */}
      <input
        type="text"
        value={currentCaption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add caption…"
        className="input-field text-xs py-1 max-w-[200px]"
        onMouseDown={(e) => e.stopPropagation()}
      />

      <div className="w-px bg-sage-light mx-1 self-stretch" />

      {/* Grid controls */}
      {!isInsideGrid ? (
        <button
          type="button"
          onClick={() => editor.chain().focus().wrapInImageGrid().run()}
          className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          Create Grid
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-xs text-forest-dark/50 mr-1">Cols:</span>
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={String(n)}
              onClick={() => editor.chain().focus().setGridColumns(n).run()}
              className="px-1.5 py-0.5 rounded text-xs text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark transition-colors"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={onAddImageToGrid}
            className="px-2 py-1 rounded text-xs bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
          >
            + Add Image
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().unwrapImageGrid().run()}
            className="px-2 py-1 rounded text-xs text-red-600/70 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            Unwrap Grid
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update RichTextEditor.tsx references**

In `src/lib/editor/RichTextEditor.tsx`, update the prop names and references:

Change the import (line 6) — no change needed, still imports `ImageToolbar` from `./ImageBubbleMenu`.

Change `showRowImagePicker` state and handler to use `showGridImagePicker`:

1. Line 23: `const [showRowImagePicker, setShowRowImagePicker] = useState(false);` → `const [showGridImagePicker, setShowGridImagePicker] = useState(false);`

2. Line 27 area — update `imageRow` reference in `useEditorState`:
   No change needed — the selector watches `vaultImage`, not `imageRow`.

3. The `handleRowVaultSelect` function (lines 143-153) — rename to `handleGridVaultSelect`:
   ```typescript
   function handleGridVaultSelect(items: VaultItem[]) {
     if (!editor || items.length === 0) return;
     const item = items[0];
     const url = item.storage_bucket === 'vault-public'
       ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${item.storage_path}`
       : item.storage_path;
     editor.chain().focus().setImage({ src: url, alt: item.file_name }).run();
     setShowGridImagePicker(false);
   }
   ```

4. The `ImageToolbar` component usage (lines 296-299):
   ```tsx
   <ImageToolbar
     editor={editor}
     onAddImageToGrid={() => setShowGridImagePicker(true)}
   />
   ```

5. The `VaultPicker` for row images (lines 323-331) — update state references:
   ```tsx
   {showGridImagePicker && (
     <VaultPicker
       orgId={orgId}
       categoryFilter={['photo']}
       onSelect={handleGridVaultSelect}
       onClose={() => setShowGridImagePicker(false)}
       defaultUploadCategory="photo"
       defaultUploadVisibility="public"
     />
   )}
   ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/editor/__tests__/ImageToolbar.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 6: Run all editor tests**

Run: `npx vitest run src/lib/editor/__tests__/`
Expected: PASS — all tests

- [ ] **Step 7: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/ImageBubbleMenu.tsx src/lib/editor/RichTextEditor.tsx src/lib/editor/__tests__/ImageToolbar.test.tsx
git commit -m "feat: toolbar width picker and grid controls"
```

---

### Task 7: Delete ImageRowExtension.ts

**Files:**
- Delete: `src/lib/editor/ImageRowExtension.ts`

- [ ] **Step 1: Verify no remaining imports of ImageRowExtension**

Run: `grep -r "ImageRowExtension\|from.*ImageRow" src/ --include="*.ts" --include="*.tsx"`
Expected: No results (extensions.ts was already updated in Task 3)

- [ ] **Step 2: Delete the file**

```bash
rm src/lib/editor/ImageRowExtension.ts
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run src/lib/editor/__tests__/`
Expected: PASS

- [ ] **Step 4: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -u src/lib/editor/ImageRowExtension.ts
git commit -m "chore: remove obsolete ImageRowExtension (replaced by ImageGrid)"
```

---

### Task 8: Integration smoke test — manual verification

**Files:** None (manual testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Open `http://localhost:3000` in the browser.

- [ ] **Step 2: Test image insertion and layout switching**

Navigate to a knowledge article editor. Insert an image via the toolbar. Verify:
- Image renders with default layout
- Clicking the image shows the ImageToolbar with layout buttons, width picker, caption input, and "Create Grid" button
- Switching between float-left, float-right, centered, full-width works
- Text flows beside float-left/right images

- [ ] **Step 3: Test drag-to-resize**

Select a float-left image. Verify:
- Resize handle appears on right edge
- Dragging changes the width with snap feedback
- Releasing commits the new width
- Width picker in toolbar reflects the new value

- [ ] **Step 4: Test image grids**

Click "Create Grid" on a selected image. Verify:
- Image wraps in a grid container
- Column picker (2/3/4) appears in toolbar
- Changing columns updates the grid layout
- "Add Image" opens vault picker and adds image to the grid
- "Unwrap Grid" extracts images back to standalone blocks

- [ ] **Step 5: Test backward compatibility**

If existing knowledge articles contain `data-type="image-row"` content, verify they render correctly as 2-column grids.

- [ ] **Step 6: Test responsive collapse**

Resize the browser window:
- At 768px: 4-column grids should collapse to 2 columns
- At 480px: all grids should become single column, floats should snap to full-width

- [ ] **Step 7: Run full test suite**

Run: `npm run test`
Run: `npm run type-check`
Run: `npm run build`
Expected: All PASS

- [ ] **Step 8: Commit any fixes from manual testing**

If any adjustments were needed, commit them:
```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
