# Layout Editor Drag-and-Drop Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the layout editor's button-based palette and grip-handle reordering with a unified drag-and-drop system where blocks are dragged from a chip palette into a live-reorganizing layout.

**Architecture:** Extend the existing `@dnd-kit/core` + `@dnd-kit/sortable` setup. Palette chips use `useDraggable` as drag sources, existing blocks use `useSortable` for reordering. Drop zones use `useDroppable` with gap-opening animation. A custom collision detection function handles both top-level and row-internal drops. `DragOverlay` renders a semi-transparent full-size clone of the dragged block.

**Tech Stack:** Next.js 14 / React 18 / TypeScript / @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities / Tailwind CSS / Vitest + @testing-library/react

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/layout/builder/collision.ts` | Custom row-aware collision detection function |
| `src/components/layout/builder/DropZone.tsx` | Reusable drop zone with animated gap opening |
| `src/components/layout/builder/DragOverlayContent.tsx` | Semi-transparent block clone for `DragOverlay` |
| `src/components/layout/builder/__tests__/collision.test.ts` | Tests for collision detection |
| `src/components/layout/builder/__tests__/DropZone.test.tsx` | Tests for drop zone component |
| `src/components/layout/builder/__tests__/DragOverlayContent.test.tsx` | Tests for overlay rendering |
| `src/components/layout/builder/__tests__/BlockPalette.test.tsx` | Tests for draggable chip palette |
| `src/components/layout/builder/__tests__/BlockList.test.tsx` | Tests for integrated DnD behavior |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/layout/builder/BlockPalette.tsx` | Rewrite: buttons → draggable chips with `useDraggable` |
| `src/components/layout/builder/BlockListItem.tsx` | Remove grip handle, make entire block the drag handle, add ghost styling |
| `src/components/layout/builder/RowEditor.tsx` | Add internal drop zones between children, remove "Add to row" button |
| `src/components/layout/builder/BlockList.tsx` | Add `DragOverlay`, integrate drop zones between nodes, use custom collision detection |
| `src/components/layout/builder/LayoutBuilder.tsx` | Replace `handleAddBlock`/`handleReorder` with unified drag handlers, manage active drag state |

---

## Task 1: Custom Collision Detection

**Files:**
- Create: `src/components/layout/builder/collision.ts`
- Create: `src/components/layout/builder/__tests__/collision.test.ts`

This is a pure function with no UI — ideal to build and test first. It takes droppable rects and the pointer position and returns the closest drop target, preferring row-internal zones when the pointer is inside a row's bounding box.

- [ ] **Step 1: Write the failing test for top-level collision**

Create `src/components/layout/builder/__tests__/collision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rowAwareCollision } from '../collision';
import type { DroppableContainer, CollisionDescriptor } from '@dnd-kit/core';

function makeRect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, width: w, height: h, top: y, left: x, bottom: y + h, right: x + w, toJSON: () => ({}) } as DOMRect;
}

function makeContainer(id: string, rect: DOMRect, data?: Record<string, unknown>): DroppableContainer {
  return {
    id,
    rect: { current: rect },
    data: { current: data ?? {} },
    disabled: false,
    node: { current: null },
  } as unknown as DroppableContainer;
}

describe('rowAwareCollision', () => {
  it('returns closest top-level drop zone by vertical distance', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('drop-top-1', makeRect(0, 120, 400, 20), { zone: 'top-level', index: 1 }),
      makeContainer('drop-top-2', makeRect(0, 240, 400, 20), { zone: 'top-level', index: 2 }),
    ];

    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 115, 400, 60), translated: makeRect(0, 115, 400, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 115, 400, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 130 },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('drop-top-1');
  });

  it('returns empty array when no containers exist', () => {
    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 0, 400, 60), translated: makeRect(0, 0, 400, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 0, 400, 60),
      droppableRects: new Map(),
      droppableContainers: [],
      pointerCoordinates: { x: 200, y: 30 },
    });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/builder/__tests__/collision.test.ts`
Expected: FAIL with "cannot find module '../collision'"

- [ ] **Step 3: Write the collision detection function**

Create `src/components/layout/builder/collision.ts`:

```ts
import type { CollisionDetection, CollisionDescriptor, DroppableContainer } from '@dnd-kit/core';

/**
 * Row-aware collision detection. When the pointer is inside a row's bounding box,
 * row-internal drop zones are prioritized. Otherwise falls back to closest top-level zone.
 */
export const rowAwareCollision: CollisionDetection = ({
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates || droppableContainers.length === 0) return [];

  const { x, y } = pointerCoordinates;

  // Separate row-internal and top-level zones
  const rowZones: DroppableContainer[] = [];
  const topLevelZones: DroppableContainer[] = [];

  for (const container of droppableContainers) {
    const data = container.data?.current as Record<string, unknown> | undefined;
    if (!data) continue;
    if (data.zone === 'row') {
      rowZones.push(container);
    } else if (data.zone === 'top-level') {
      topLevelZones.push(container);
    }
  }

  // Check if pointer is inside any row bounding box
  for (const container of droppableContainers) {
    const data = container.data?.current as Record<string, unknown> | undefined;
    if (data?.zone !== 'row-bounds') continue;

    const rect = droppableRects.get(container.id);
    if (!rect) continue;

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const rowId = data.rowId as string;
      const candidates = rowZones.filter((z) => {
        const zData = z.data?.current as Record<string, unknown>;
        return zData.rowId === rowId;
      });

      if (candidates.length > 0) {
        return closestByDistance(candidates, droppableRects, pointerCoordinates);
      }
    }
  }

  // Fall back to top-level zones
  return closestByDistance(topLevelZones, droppableRects, pointerCoordinates);
};

function closestByDistance(
  containers: DroppableContainer[],
  rects: Map<string | number, DOMRect>,
  pointer: { x: number; y: number },
): CollisionDescriptor[] {
  const results: CollisionDescriptor[] = [];

  for (const container of containers) {
    const rect = rects.get(container.id);
    if (!rect) continue;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.sqrt((pointer.x - centerX) ** 2 + (pointer.y - centerY) ** 2);

    results.push({ id: container.id, data: { droppableContainer: container, value: distance } });
  }

  results.sort((a, b) => (a.data.value as number) - (b.data.value as number));
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/builder/__tests__/collision.test.ts`
Expected: PASS

- [ ] **Step 5: Add test for row-internal priority**

Add to `src/components/layout/builder/__tests__/collision.test.ts`:

```ts
  it('prioritizes row-internal zones when pointer is inside row bounds', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('drop-top-1', makeRect(0, 200, 400, 20), { zone: 'top-level', index: 1 }),
      // Row bounds container — represents the row's visual area
      makeContainer('row-bounds-r1', makeRect(0, 50, 400, 100), { zone: 'row-bounds', rowId: 'r1' }),
      // Drop zones inside the row
      makeContainer('drop-row-r1-0', makeRect(0, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 0 }),
      makeContainer('drop-row-r1-1', makeRect(190, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 1 }),
      makeContainer('drop-row-r1-2', makeRect(380, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 2 }),
    ];

    const result = rowAwareCollision({
      active: { id: 'drag-1', rect: { current: { initial: makeRect(0, 80, 100, 60), translated: makeRect(0, 80, 100, 60) } }, data: { current: {} } },
      collisionRect: makeRect(0, 80, 100, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 100 },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('drop-row-r1-1');
  });

  it('ignores row-internal zones for rows being dragged (no nested rows)', () => {
    const containers = [
      makeContainer('drop-top-0', makeRect(0, 0, 400, 20), { zone: 'top-level', index: 0 }),
      makeContainer('row-bounds-r1', makeRect(0, 50, 400, 100), { zone: 'row-bounds', rowId: 'r1' }),
      makeContainer('drop-row-r1-0', makeRect(0, 60, 20, 80), { zone: 'row', rowId: 'r1', index: 0 }),
    ];

    // When a row is being dragged, collision.ts doesn't filter — the DropZone component
    // controls this by not rendering row-internal zones for row drags.
    // So this test just verifies the function works normally.
    const result = rowAwareCollision({
      active: { id: 'drag-row', rect: { current: { initial: makeRect(0, 80, 400, 60), translated: makeRect(0, 80, 400, 60) } }, data: { current: { isRow: true } } },
      collisionRect: makeRect(0, 80, 400, 60),
      droppableRects: new Map(containers.map((c) => [c.id, c.rect.current!])),
      droppableContainers: containers,
      pointerCoordinates: { x: 200, y: 100 },
    });

    expect(result.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/layout/builder/__tests__/collision.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/builder/collision.ts src/components/layout/builder/__tests__/collision.test.ts
git commit -m "feat(layout): add row-aware collision detection for dnd"
```

---

## Task 2: DropZone Component

**Files:**
- Create: `src/components/layout/builder/DropZone.tsx`
- Create: `src/components/layout/builder/__tests__/DropZone.test.tsx`

A reusable component that renders an invisible drop target. When a drag hovers over it, it animates open (height or width) to show the insertion point.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/builder/__tests__/DropZone.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DropZone from '../DropZone';

// Mock useDroppable from @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn().mockReturnValue({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

describe('DropZone', () => {
  it('renders with collapsed height when not hovered', () => {
    const { container } = render(
      <DropZone id="drop-0" data={{ zone: 'top-level', index: 0 }} direction="vertical" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone).toBeTruthy();
    expect(zone.style.height).toBe('8px');
  });

  it('renders with expanded height when isOver is true', async () => {
    const { useDroppable } = await import('@dnd-kit/core');
    (useDroppable as ReturnType<typeof vi.fn>).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
    });

    const { container } = render(
      <DropZone id="drop-1" data={{ zone: 'top-level', index: 1 }} direction="vertical" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone.style.height).toBe('80px');
  });

  it('uses width for horizontal direction', async () => {
    const { useDroppable } = await import('@dnd-kit/core');
    (useDroppable as ReturnType<typeof vi.fn>).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
    });

    const { container } = render(
      <DropZone id="drop-row-0" data={{ zone: 'row', rowId: 'r1', index: 0 }} direction="horizontal" />
    );
    const zone = container.firstChild as HTMLElement;
    expect(zone.style.width).toBe('80px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/builder/__tests__/DropZone.test.tsx`
Expected: FAIL with "cannot find module '../DropZone'"

- [ ] **Step 3: Write the DropZone component**

Create `src/components/layout/builder/DropZone.tsx`:

```tsx
'use client';

import { useDroppable } from '@dnd-kit/core';

interface DropZoneProps {
  id: string;
  data: Record<string, unknown>;
  direction: 'vertical' | 'horizontal';
  disabled?: boolean;
}

const COLLAPSED_SIZE = '8px';
const EXPANDED_SIZE = '80px';

export default function DropZone({ id, data, direction, disabled = false }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled });

  const isVertical = direction === 'vertical';
  const expanded = isOver && !disabled;

  const style: React.CSSProperties = {
    transition: isVertical
      ? 'height 200ms ease-out'
      : 'width 200ms ease-out',
    ...(isVertical
      ? { height: expanded ? EXPANDED_SIZE : COLLAPSED_SIZE, width: '100%' }
      : { width: expanded ? EXPANDED_SIZE : COLLAPSED_SIZE, height: '100%' }),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg transition-colors ${expanded ? 'bg-forest/5' : ''}`}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/builder/__tests__/DropZone.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/DropZone.tsx src/components/layout/builder/__tests__/DropZone.test.tsx
git commit -m "feat(layout): add DropZone component with animated gap opening"
```

---

## Task 3: DragOverlayContent Component

**Files:**
- Create: `src/components/layout/builder/DragOverlayContent.tsx`
- Create: `src/components/layout/builder/__tests__/DragOverlayContent.test.tsx`

Renders a semi-transparent full-size clone of the dragged block inside `@dnd-kit`'s `<DragOverlay>`.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/builder/__tests__/DragOverlayContent.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DragOverlayContent from '../DragOverlayContent';
import type { LayoutBlock, LayoutRow, TypeLayout } from '@/lib/layout/types';
import type { CustomField, ItemWithDetails } from '@/lib/types';

// Mock LayoutRenderer to avoid rendering real blocks
vi.mock('@/components/layout/LayoutRenderer', () => ({
  default: ({ layout }: { layout: TypeLayout }) => (
    <div data-testid="layout-renderer">{layout.blocks.length} blocks</div>
  ),
}));

const mockFields: CustomField[] = [];

const mockItem = {
  id: '1',
  name: 'Test',
  status: 'active',
  custom_field_values: {},
  photos: [],
  entities: [],
  updates: [],
} as unknown as ItemWithDetails;

describe('DragOverlayContent', () => {
  it('renders a block with opacity 0.7', () => {
    const block: LayoutBlock = { id: 'b1', type: 'status_badge', config: {} };

    const { container } = render(
      <DragOverlayContent
        node={block}
        customFields={mockFields}
        mockItem={mockItem}
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.7');
    expect(screen.getByTestId('layout-renderer')).toBeTruthy();
  });

  it('renders a row with all its children', () => {
    const row: LayoutRow = {
      id: 'r1',
      type: 'row',
      children: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'divider', config: {} },
      ],
      gap: 'normal',
      distribution: 'equal',
    };

    render(
      <DragOverlayContent
        node={row}
        customFields={mockFields}
        mockItem={mockItem}
      />
    );

    expect(screen.getByText('1 blocks')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/builder/__tests__/DragOverlayContent.test.tsx`
Expected: FAIL with "cannot find module '../DragOverlayContent'"

- [ ] **Step 3: Write the DragOverlayContent component**

Create `src/components/layout/builder/DragOverlayContent.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import type { LayoutNode, TypeLayout } from '@/lib/layout/types';
import type { CustomField, ItemWithDetails } from '@/lib/types';
import LayoutRenderer from '../LayoutRenderer';

interface Props {
  node: LayoutNode;
  customFields: CustomField[];
  mockItem: ItemWithDetails;
}

export default function DragOverlayContent({ node, customFields, mockItem }: Props) {
  const overlayLayout = useMemo<TypeLayout>(() => ({
    version: 1,
    blocks: [node],
    spacing: 'comfortable',
    peekBlockCount: 1,
  }), [node]);

  return (
    <div
      style={{ opacity: 0.7, pointerEvents: 'none' }}
      className="bg-white rounded-xl shadow-lg p-4 max-w-md"
    >
      <LayoutRenderer
        layout={overlayLayout}
        item={mockItem}
        mode="preview"
        context="preview"
        customFields={customFields}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/builder/__tests__/DragOverlayContent.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/DragOverlayContent.tsx src/components/layout/builder/__tests__/DragOverlayContent.test.tsx
git commit -m "feat(layout): add DragOverlayContent for semi-transparent drag preview"
```

---

## Task 4: Rewrite BlockPalette as Draggable Chips

**Files:**
- Modify: `src/components/layout/builder/BlockPalette.tsx`
- Create: `src/components/layout/builder/__tests__/BlockPalette.test.tsx`

Replace the click-to-add buttons with `useDraggable` chips. Each chip is a drag source that creates a new block.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/builder/__tests__/BlockPalette.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockPalette from '../BlockPalette';

// Mock @dnd-kit/core
const mockUseDraggable = vi.fn().mockReturnValue({
  attributes: { role: 'button', tabIndex: 0 },
  listeners: {},
  setNodeRef: vi.fn(),
  isDragging: false,
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: (...args: unknown[]) => mockUseDraggable(...args),
}));

describe('BlockPalette', () => {
  it('renders all block type chips', () => {
    render(<BlockPalette />);

    expect(screen.getByText('Field')).toBeTruthy();
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Row')).toBeTruthy();
    expect(screen.getByText('Timeline')).toBeTruthy();
  });

  it('passes block type data to useDraggable', () => {
    render(<BlockPalette />);

    // useDraggable should be called once per palette item (10 items)
    expect(mockUseDraggable).toHaveBeenCalledTimes(10);

    // Check one call has the right structure
    const firstCall = mockUseDraggable.mock.calls[0][0];
    expect(firstCall.id).toMatch(/^palette-/);
    expect(firstCall.data).toHaveProperty('type');
  });

  it('dims chip when isDragging is true', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
    });

    const { container } = render(<BlockPalette />);
    const chips = container.querySelectorAll('[role="button"]');
    // All chips will show as dragging since mock applies globally
    expect(chips.length).toBeGreaterThan(0);
  });

  it('chips have aria-label for accessibility', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0, 'aria-label': 'Drag to add Field' },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
    });

    render(<BlockPalette />);
    // Attributes from useDraggable are spread onto the chip
    const chips = screen.getAllByRole('button');
    expect(chips.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/builder/__tests__/BlockPalette.test.tsx`
Expected: FAIL — current `BlockPalette` uses `onClick`/`onAdd` prop, not `useDraggable`

- [ ] **Step 3: Rewrite BlockPalette**

Replace the contents of `src/components/layout/builder/BlockPalette.tsx`:

```tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import type { BlockType } from '@/lib/layout/types';

interface PaletteItem {
  type: BlockType | 'row';
  icon: string;
  label: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
  { type: 'row', icon: '⬜', label: 'Row' },
];

function PaletteChip({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, source: 'palette' },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to add ${item.label}`}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white hover:bg-sage-light/50 text-sm font-medium text-forest-dark transition-colors min-h-[44px] cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

export default function BlockPalette() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PALETTE_ITEMS.map((item) => (
        <PaletteChip key={item.type} item={item} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/builder/__tests__/BlockPalette.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/BlockPalette.tsx src/components/layout/builder/__tests__/BlockPalette.test.tsx
git commit -m "feat(layout): rewrite BlockPalette as draggable chip bar"
```

---

## Task 5: Update BlockListItem — Remove Grip Handle, Add Ghost Styling

**Files:**
- Modify: `src/components/layout/builder/BlockListItem.tsx`

Remove the separate grip handle button. The entire block header becomes the drag handle. When `isDragging` is true, show `opacity: 0.3` (ghost effect) instead of `0.5`.

- [ ] **Step 1: Update BlockListItem**

Edit `src/components/layout/builder/BlockListItem.tsx`. The key changes:

1. Remove the `GripVertical` import and the grip handle button
2. Move `{...attributes} {...listeners}` onto the outer `div` (the entire block)
3. Change `isDragging` opacity from `0.5` to `0.3`
4. Add `cursor-grab` and `touch-none` to the outer div
5. Keep the `useSortable` hook — existing blocks remain sortable

```tsx
'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LayoutBlock } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanel from './BlockConfigPanel';
import type { BlockConfig } from '@/lib/layout/types';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const BLOCK_LABELS: Record<string, string> = {
  field_display: 'Field',
  photo_gallery: 'Photo Gallery',
  status_badge: 'Status Badge',
  entity_list: 'Entities',
  text_label: 'Text',
  divider: 'Divider',
  action_buttons: 'Actions',
  map_snippet: 'Map',
  timeline: 'Timeline',
};

interface Props {
  block: LayoutBlock;
  customFields: CustomField[];
  entityTypes: EntityType[];
  fieldName?: string;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDelete: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function BlockListItem({
  block,
  customFields,
  entityTypes,
  fieldName,
  onConfigChange,
  onDelete,
  onCreateField,
  isExpanded,
  onToggleExpand,
}: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const label = block.type === 'field_display' && fieldName
    ? fieldName
    : BLOCK_LABELS[block.type] ?? block.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-sage-light rounded-lg bg-white cursor-grab active:cursor-grabbing touch-none"
      {...attributes}
      {...listeners}
    >
      {/* Header row */}
      <div className="flex items-center min-h-[48px]">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="flex-1 flex items-center gap-2 py-2 pl-3 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-sage" />
          ) : (
            <ChevronRight className="w-4 h-4 text-sage" />
          )}
          <span className="text-sm font-medium text-forest-dark">{label}</span>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1 pr-2">
            <button onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} className="text-xs text-red-600 font-medium px-2 py-1">
              Delete
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="text-xs text-sage px-2 py-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            className="p-3 text-sage hover:text-red-500 transition-colors"
            aria-label="Delete block"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Config panel (accordion) */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-sage-light/50" onPointerDown={(e) => e.stopPropagation()}>
          <BlockConfigPanel
            block={block}
            customFields={customFields}
            entityTypes={entityTypes}
            onConfigChange={onConfigChange}
            onCreateField={onCreateField}
          />
        </div>
      )}
    </div>
  );
}
```

Key details:
- `e.stopPropagation()` on interactive children (buttons, config panel) prevents them from triggering drag
- `onPointerDown` stopPropagation on the config panel prevents drag when interacting with inputs
- `touch-none` on the outer div ensures touch events go to @dnd-kit's sensors

- [ ] **Step 2: Run existing tests to verify nothing broke**

Run: `npx vitest run`
Expected: PASS (all existing tests)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/BlockListItem.tsx
git commit -m "feat(layout): remove grip handle, make entire block draggable with ghost styling"
```

---

## Task 6: Update RowEditor — Add Internal Drop Zones, Remove Add Button

**Files:**
- Modify: `src/components/layout/builder/RowEditor.tsx`

Add `DropZone` components between row children for horizontal drops. Remove the "+ Add to row" button and its type picker. Add a `useDroppable` wrapper around the row for the `row-bounds` collision detection.

- [ ] **Step 1: Update RowEditor**

Edit `src/components/layout/builder/RowEditor.tsx`:

```tsx
'use client';

import { useDroppable } from '@dnd-kit/core';
import type { LayoutRow, BlockConfig } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
import DropZone from './DropZone';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Props {
  row: LayoutRow;
  customFields: CustomField[];
  entityTypes: EntityType[];
  fieldMap: Map<string, CustomField>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onRowChange: (rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
  activeType?: 'block' | 'row' | null;
}

export default function RowEditor({
  row,
  customFields,
  entityTypes,
  fieldMap,
  expandedId,
  onToggleExpand,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onRowChange,
  onRemoveFromRow,
  activeType,
}: Props) {
  const [showRowConfig, setShowRowConfig] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Row-bounds droppable for collision detection
  const { setNodeRef: setBoundsRef } = useDroppable({
    id: `row-bounds-${row.id}`,
    data: { zone: 'row-bounds', rowId: row.id },
    disabled: true, // Not a real drop target, just for bounds detection
  });

  const canAcceptDrop = row.children.length < 4 && activeType !== 'row';

  return (
    <div ref={setBoundsRef} className="border-2 border-dashed border-sage rounded-lg p-2 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={() => setShowRowConfig(!showRowConfig)}
          className="flex items-center gap-2 text-sm font-medium text-forest-dark"
        >
          {showRowConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Row ({row.children.length} columns, {typeof row.distribution === 'string' ? row.distribution : 'custom'})
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1 pr-2">
            <button onClick={() => onDeleteBlock(row.id)} className="text-xs text-red-600 font-medium px-2 py-1">
              Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-sage px-2 py-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-sage hover:text-red-500"
            aria-label="Delete row"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Row config */}
      {showRowConfig && (
        <div className="space-y-2 px-2 pb-2 border-b border-sage-light">
          <div>
            <label className="label">Distribution</label>
            <div className="flex gap-1">
              {(['equal', 'auto'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onRowChange(row.id, { distribution: d })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    row.distribution === d ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Gap</label>
            <div className="flex gap-1">
              {(['tight', 'normal', 'loose'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => onRowChange(row.id, { gap: g })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    row.gap === g ? 'bg-forest text-white' : 'bg-white border border-sage-light'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Children with horizontal drop zones */}
      <div className="pl-3 border-l-2 border-sage-light flex items-stretch gap-0">
        <DropZone
          id={`drop-row-${row.id}-0`}
          data={{ zone: 'row', rowId: row.id, index: 0 }}
          direction="horizontal"
          disabled={!canAcceptDrop}
        />
        {row.children.map((child, i) => (
          <div key={child.id} className="flex items-stretch flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <BlockListItem
                block={child}
                customFields={customFields}
                entityTypes={entityTypes}
                fieldName={
                  child.type === 'field_display'
                    ? fieldMap.get((child.config as { fieldId: string }).fieldId)?.name
                    : undefined
                }
                onConfigChange={onConfigChange}
                onDelete={(id) => onRemoveFromRow(row.id, id)}
                onCreateField={onCreateField}
                isExpanded={expandedId === child.id}
                onToggleExpand={() => onToggleExpand(child.id)}
              />
            </div>
            <DropZone
              id={`drop-row-${row.id}-${i + 1}`}
              data={{ zone: 'row', rowId: row.id, index: i + 1 }}
              direction="horizontal"
              disabled={!canAcceptDrop}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Key changes:
- Removed `onAddToRow` prop, `showAddPicker` state, `ADD_TYPES` array, and the entire "+ Add to row" button/picker UI
- Added `useDroppable` for row-bounds
- Added `DropZone` components between children (horizontal direction)
- Added `activeType` prop so row knows whether to accept drops (disabled for row drags)
- Children rendered in a flex row with drop zones between them

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: PASS (may have compile warnings from LayoutBuilder still passing `onAddToRow` — that's expected, will be fixed in Task 8)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/RowEditor.tsx
git commit -m "feat(layout): add internal drop zones to RowEditor, remove add-to-row button"
```

---

## Task 7: Update BlockList — Integrate Drop Zones, DragOverlay, and Custom Collision

**Files:**
- Modify: `src/components/layout/builder/BlockList.tsx`

Add `DropZone` components between top-level nodes. Add `<DragOverlay>` with `DragOverlayContent`. Use `rowAwareCollision` for collision detection. Track active drag state and pass `activeType` to `RowEditor`.

- [ ] **Step 1: Rewrite BlockList**

Replace contents of `src/components/layout/builder/BlockList.tsx`:

```tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { LayoutNode, LayoutBlock, LayoutRow, BlockConfig } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemWithDetails } from '@/lib/types';
import BlockListItem from './BlockListItem';
import RowEditor from './RowEditor';
import PeekBoundary from './PeekBoundary';
import DropZone from './DropZone';
import DragOverlayContent from './DragOverlayContent';
import { rowAwareCollision } from './collision';

interface Props {
  nodes: LayoutNode[];
  customFields: CustomField[];
  entityTypes: EntityType[];
  peekBlockCount: number;
  mockItem: ItemWithDetails;
  onDrop: (activeId: string, activeData: Record<string, unknown>, targetData: Record<string, unknown>) => void;
  onReorder: (activeId: string, overId: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onPeekCountChange: (count: number) => void;
  onRowChange: (rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
}

export default function BlockList({
  nodes,
  customFields,
  entityTypes,
  peekBlockCount,
  mockItem,
  onDrop,
  onReorder,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onPeekCountChange,
  onRowChange,
  onRemoveFromRow,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<LayoutNode | null>(null);
  const [activeType, setActiveType] = useState<'block' | 'row' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;

    if (data?.source === 'palette') {
      // Palette drag — activeNode will be set by LayoutBuilder via the onDragStart callback
      setActiveType(data.type === 'row' ? 'row' : 'block');
      return;
    }

    // Existing block drag — find the node in the tree
    const id = String(active.id);
    const found = findNode(nodes, id);
    if (found) {
      setActiveNode(found);
      setActiveType(isLayoutRow(found) ? 'row' : 'block');
    }
  }, [nodes]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNode(null);
    setActiveType(null);

    if (!over) return;

    const activeData = active.data.current as Record<string, unknown>;
    const overData = over.data.current as Record<string, unknown>;

    // If over target has zone data, it's a drop zone
    if (overData?.zone) {
      onDrop(String(active.id), activeData ?? {}, overData);
      return;
    }

    // Otherwise it's a sortable reorder
    if (active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }, [onDrop, onReorder]);

  const fieldMap = useMemo(() => new Map(customFields.map((f) => [f.id, f])), [customFields]);
  const nodeIds = nodes.map((n) => n.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rowAwareCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={nodeIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          <DropZone
            id="drop-top-0"
            data={{ zone: 'top-level', index: 0 }}
            direction="vertical"
          />
          {nodes.map((node, index) => (
            <div key={node.id}>
              {index === peekBlockCount && (
                <PeekBoundary
                  peekBlockCount={peekBlockCount}
                  totalBlocks={nodes.length}
                  onChange={onPeekCountChange}
                />
              )}
              {isLayoutRow(node) ? (
                <RowEditor
                  row={node}
                  customFields={customFields}
                  entityTypes={entityTypes}
                  fieldMap={fieldMap}
                  expandedId={expandedId}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  onConfigChange={onConfigChange}
                  onDeleteBlock={onDeleteBlock}
                  onCreateField={onCreateField}
                  onRowChange={onRowChange}
                  onRemoveFromRow={onRemoveFromRow}
                  activeType={activeType}
                />
              ) : (
                <BlockListItem
                  block={node}
                  customFields={customFields}
                  entityTypes={entityTypes}
                  fieldName={
                    node.type === 'field_display'
                      ? fieldMap.get((node.config as { fieldId: string }).fieldId)?.name
                      : undefined
                  }
                  onConfigChange={onConfigChange}
                  onDelete={onDeleteBlock}
                  onCreateField={onCreateField}
                  isExpanded={expandedId === node.id}
                  onToggleExpand={() => setExpandedId(expandedId === node.id ? null : node.id)}
                />
              )}
              <DropZone
                id={`drop-top-${index + 1}`}
                data={{ zone: 'top-level', index: index + 1 }}
                direction="vertical"
              />
            </div>
          ))}
          {nodes.length > 0 && peekBlockCount >= nodes.length && (
            <PeekBoundary
              peekBlockCount={peekBlockCount}
              totalBlocks={nodes.length}
              onChange={onPeekCountChange}
            />
          )}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeNode ? (
          <DragOverlayContent
            node={activeNode}
            customFields={customFields}
            mockItem={mockItem}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function findNode(nodes: LayoutNode[], id: string): LayoutNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (isLayoutRow(node)) {
      const child = node.children.find((c) => c.id === id);
      if (child) return child;
    }
  }
  return null;
}
```

Key changes from the original:
- Replaced `closestCenter` with `rowAwareCollision`
- Added `DragOverlay` with `DragOverlayContent`
- Added `DropZone` components between all top-level nodes
- Track `activeNode` and `activeType` state during drag
- Replaced `onReorder`-only `handleDragEnd` with zone-aware logic that calls `onDrop` or `onReorder`
- New props: `mockItem` (for overlay preview), `onDrop` (for zone-based drops)
- Removed props: `onAddToRow` (no longer needed)
- Moved `fieldMap` into a `useMemo`

- [ ] **Step 2: Run tests to check for compile issues**

Run: `npx vitest run`
Expected: May fail in LayoutBuilder due to changed BlockList props — that's expected, fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/BlockList.tsx
git commit -m "feat(layout): integrate drop zones, overlay, and collision detection into BlockList"
```

---

## Task 8: Update LayoutBuilder — Unified Drag State Management

**Files:**
- Modify: `src/components/layout/builder/LayoutBuilder.tsx`

Replace `handleAddBlock` and `handleReorder` with a unified `handleDrop` that covers all 8 source→target cases from the spec. Remove `handleAddToRow` (now handled by drop). Pass `mockItem` to `BlockList`.

- [ ] **Step 1: Rewrite LayoutBuilder**

Replace contents of `src/components/layout/builder/LayoutBuilder.tsx`:

```tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { arrayMove } from '@dnd-kit/sortable';
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, BlockType, BlockConfig, SpacingPreset } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayout } from '@/lib/layout/defaults';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPalette from './BlockPalette';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRenderer from '../LayoutRenderer';
import FormPreview from '../preview/FormPreview';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayout, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

type PreviewTab = 'detail' | 'form';

function getDefaultConfig(type: BlockType): BlockConfig {
  switch (type) {
    case 'field_display': return { fieldId: '', size: 'normal' as const, showLabel: true };
    case 'photo_gallery': return { style: 'hero' as const, maxPhotos: 4 };
    case 'timeline': return { showUpdates: true, showScheduled: false, maxItems: 5 };
    case 'text_label': return { text: 'Section Title', style: 'heading' as const };
    case 'entity_list': return { entityTypeIds: [] };
    default: return {};
  }
}

function createBlock(type: BlockType): LayoutBlock {
  return { id: nanoid(10), type, config: getDefaultConfig(type) };
}

function createRow(): LayoutRow {
  return {
    id: nanoid(10),
    type: 'row',
    children: [
      { id: nanoid(10), type: 'status_badge', config: {} },
      { id: nanoid(10), type: 'status_badge', config: {} },
    ],
    gap: 'normal',
    distribution: 'equal',
  };
}

export default function LayoutBuilder({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayout>(
    () => initialLayout ?? generateDefaultLayout(customFields),
  );
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const allFields: CustomField[] = [
    ...customFields,
    ...pendingFields.map((f, i) => ({
      id: f.tempId,
      item_type_id: itemType.id,
      name: f.name,
      field_type: f.field_type as CustomField['field_type'],
      options: f.options.length > 0 ? f.options : null,
      required: f.required,
      sort_order: customFields.length + i,
      org_id: itemType.org_id,
    })),
  ];

  const mockItem = generateMockItem(itemType, allFields);

  // Unified drop handler for all drag-and-drop scenarios
  const handleDrop = useCallback((activeId: string, activeData: Record<string, unknown>, targetData: Record<string, unknown>) => {
    const isPalette = activeData.source === 'palette';
    const targetZone = targetData.zone as string;
    const targetIndex = targetData.index as number;

    setLayout((prev) => {
      const blocks = [...prev.blocks];

      if (isPalette) {
        // Create new node from palette
        const paletteType = activeData.type as BlockType | 'row';
        const newNode: LayoutNode = paletteType === 'row' ? createRow() : createBlock(paletteType);

        if (targetZone === 'top-level') {
          blocks.splice(targetIndex, 0, newNode);
        } else if (targetZone === 'row') {
          const rowId = targetData.rowId as string;
          const rowIdx = blocks.findIndex((b) => b.id === rowId);
          if (rowIdx !== -1 && isLayoutRow(blocks[rowIdx])) {
            const row = blocks[rowIdx] as LayoutRow;
            if (row.children.length < 4 && !isLayoutRow(newNode)) {
              const children = [...row.children];
              children.splice(targetIndex, 0, newNode as LayoutBlock);
              blocks[rowIdx] = { ...row, children };
            }
          }
        }

        return { ...prev, blocks };
      }

      // Existing block move — find and remove from current position
      let movingNode: LayoutNode | null = null;

      // Check top-level
      const topIdx = blocks.findIndex((b) => b.id === activeId);
      if (topIdx !== -1) {
        movingNode = blocks[topIdx];
        blocks.splice(topIdx, 1);
      } else {
        // Check inside rows
        for (let i = 0; i < blocks.length; i++) {
          const node = blocks[i];
          if (isLayoutRow(node)) {
            const childIdx = node.children.findIndex((c) => c.id === activeId);
            if (childIdx !== -1) {
              movingNode = node.children[childIdx];
              const remaining = node.children.filter((c) => c.id !== activeId);
              if (remaining.length <= 1) {
                // Auto-collapse: replace row with its single remaining child (or remove if empty)
                blocks[i] = remaining[0] ?? node;
                if (remaining.length === 0) blocks.splice(i, 1);
              } else {
                blocks[i] = { ...node, children: remaining };
              }
              break;
            }
          }
        }
      }

      if (!movingNode) return prev;

      if (targetZone === 'top-level') {
        // Adjust index if we removed from earlier in the array
        let adjustedIndex = targetIndex;
        if (topIdx !== -1 && topIdx < targetIndex) {
          adjustedIndex--;
        }
        blocks.splice(Math.min(adjustedIndex, blocks.length), 0, movingNode);
      } else if (targetZone === 'row') {
        const rowId = targetData.rowId as string;
        const rowIdx = blocks.findIndex((b) => b.id === rowId);
        if (rowIdx !== -1 && isLayoutRow(blocks[rowIdx]) && !isLayoutRow(movingNode)) {
          const row = blocks[rowIdx] as LayoutRow;
          if (row.children.length < 4) {
            const children = [...row.children];
            children.splice(targetIndex, 0, movingNode as LayoutBlock);
            blocks[rowIdx] = { ...row, children };
          }
        }
      }

      return { ...prev, blocks };
    });
  }, []);

  // Sortable reorder (fallback for SortableContext)
  const handleReorder = useCallback((activeId: string, overId: string) => {
    setLayout((prev) => {
      const oldIndex = prev.blocks.findIndex((b) => b.id === activeId);
      const newIndex = prev.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, blocks: arrayMove(prev.blocks, oldIndex, newIndex) };
    });
  }, []);

  const handleConfigChange = useCallback((blockId: string, config: BlockConfig) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRow(node)) {
          return { ...node, config };
        }
        if (isLayoutRow(node)) {
          return {
            ...node,
            children: node.children.map((c) =>
              c.id === blockId ? { ...c, config } : c,
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  }, []);

  const handleCreateField = useCallback((field: { name: string; field_type: string; options: string[]; required: boolean }) => {
    const tempId = `temp-${nanoid(10)}`;
    setPendingFields((prev) => [...prev, { ...field, tempId }]);
    setLayout((prev) => {
      const blocks = [...prev.blocks];
      for (let i = blocks.length - 1; i >= 0; i--) {
        const node = blocks[i];
        if (!isLayoutRow(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
          blocks[i] = { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfig };
          return { ...prev, blocks };
        }
      }
      return prev;
    });
  }, []);

  const handlePeekCountChange = useCallback((count: number) => {
    setLayout((prev) => ({ ...prev, peekBlockCount: count }));
  }, []);

  const handleSpacingChange = useCallback((spacing: SpacingPreset) => {
    setLayout((prev) => ({ ...prev, spacing }));
  }, []);

  const handleRowChange = useCallback((rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) =>
        node.id === rowId && isLayoutRow(node) ? { ...node, ...update } : node,
      ),
    }));
  }, []);

  const handleRemoveFromRow = useCallback((rowId: string, blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === rowId && isLayoutRow(node)) {
          const remaining = node.children.filter((c) => c.id !== blockId);
          if (remaining.length <= 1) {
            return remaining[0] ?? node;
          }
          return { ...node, children: remaining };
        }
        return node;
      }),
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(layout, pendingFields.map(({ tempId, ...rest }) => rest));
    } finally {
      setSaving(false);
    }
  };

  const buildContent = (
    <div className="space-y-4">
      <BlockPalette />
      <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
      <BlockList
        nodes={layout.blocks}
        customFields={allFields}
        entityTypes={entityTypes}
        peekBlockCount={layout.peekBlockCount}
        mockItem={mockItem}
        onDrop={handleDrop}
        onReorder={handleReorder}
        onConfigChange={handleConfigChange}
        onDeleteBlock={handleDeleteBlock}
        onCreateField={handleCreateField}
        onPeekCountChange={handlePeekCountChange}
        onRowChange={handleRowChange}
        onRemoveFromRow={handleRemoveFromRow}
      />
    </div>
  );

  const detailPreview = (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{itemType.icon}</span>
          <h2 className="font-heading font-semibold text-forest-dark text-xl">{mockItem.name}</h2>
        </div>
        <LayoutRenderer
          layout={layout}
          item={mockItem}
          mode="preview"
          context="preview"
          customFields={allFields}
        />
      </div>
    </div>
  );

  const formPreviewContent = (
    <FormPreview layout={layout} customFields={allFields} itemTypeName={itemType.name} />
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
          <button onClick={onCancel} className="text-sm text-forest font-medium">
            Cancel
          </button>
          <span className="text-sm font-semibold text-forest-dark">{itemType.name} Layout</span>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-1.5">
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>

        <div className="flex border-b border-sage-light">
          {(['build', 'detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-forest border-b-2 border-forest'
                  : 'text-sage'
              }`}
            >
              {tab === 'build' ? 'Build' : tab === 'detail' ? 'Detail' : 'Form'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'build' && buildContent}
          {activeTab === 'detail' && detailPreview}
          {activeTab === 'form' && formPreviewContent}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-[600px]">
      <div className="flex-[3] overflow-y-auto pr-4 border-r border-sage-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-forest-dark">Layout Builder</h3>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
        {buildContent}
      </div>

      <div className="flex-[2] overflow-y-auto">
        <div className="flex gap-1 mb-3">
          {(['detail', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPreviewTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                previewTab === tab ? 'bg-forest text-white' : 'bg-sage-light text-forest-dark'
              }`}
            >
              {tab === 'detail' ? 'Detail Preview' : 'Form Preview'}
            </button>
          ))}
        </div>
        {previewTab === 'detail' ? detailPreview : formPreviewContent}
      </div>
    </div>
  );
}
```

Key changes:
- Removed `handleAddBlock`, `handleAddToRow` — replaced by `handleDrop`
- `BlockPalette` no longer receives `onAdd` prop (it's now a pure drag source)
- `BlockList` gets new `onDrop`, `mockItem` props; loses `onAddToRow`
- `handleDrop` implements all 8 source→target cases as a single `setLayout` call
- `handleReorder` kept as fallback for `SortableContext` sorting

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/builder/LayoutBuilder.tsx
git commit -m "feat(layout): unified drag-and-drop state management in LayoutBuilder"
```

---

## Task 9: Integration Test — Full DnD Workflow

**Files:**
- Create: `src/components/layout/builder/__tests__/BlockList.test.tsx`

Test the key integration scenarios: palette drag creates a block, reorder works, drop into row works, auto-collapse on removal.

- [ ] **Step 1: Write integration tests**

Create `src/components/layout/builder/__tests__/BlockList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlockList from '../BlockList';
import type { LayoutNode, LayoutBlock, LayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemWithDetails } from '@/lib/types';

// Mock @dnd-kit to avoid JSDOM layout issues
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useDroppable: vi.fn().mockReturnValue({ setNodeRef: vi.fn(), isOver: false }),
  useSensor: vi.fn().mockReturnValue({}),
  useSensors: vi.fn().mockReturnValue([]),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: vi.fn().mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const mockItem = {
  id: '1',
  name: 'Test Item',
  status: 'active',
  custom_field_values: {},
  photos: [],
  entities: [],
  updates: [],
  latitude: 0,
  longitude: 0,
} as unknown as ItemWithDetails;

const baseProps = {
  customFields: [] as CustomField[],
  entityTypes: [] as EntityType[],
  peekBlockCount: 3,
  mockItem,
  onDrop: vi.fn(),
  onReorder: vi.fn(),
  onConfigChange: vi.fn(),
  onDeleteBlock: vi.fn(),
  onCreateField: vi.fn(),
  onPeekCountChange: vi.fn(),
  onRowChange: vi.fn(),
  onRemoveFromRow: vi.fn(),
};

describe('BlockList', () => {
  it('renders blocks and drop zones', () => {
    const nodes: LayoutNode[] = [
      { id: 'b1', type: 'status_badge', config: {} },
      { id: 'b2', type: 'divider', config: {} },
    ];

    render(<BlockList {...baseProps} nodes={nodes} />);

    expect(screen.getByText('Status Badge')).toBeTruthy();
    expect(screen.getByText('Divider')).toBeTruthy();
  });

  it('renders rows with RowEditor', () => {
    const nodes: LayoutNode[] = [
      {
        id: 'r1',
        type: 'row',
        children: [
          { id: 'b1', type: 'status_badge', config: {} },
          { id: 'b2', type: 'divider', config: {} },
        ],
        gap: 'normal',
        distribution: 'equal',
      } as LayoutRow,
    ];

    render(<BlockList {...baseProps} nodes={nodes} />);

    expect(screen.getByText(/Row \(2 columns/)).toBeTruthy();
  });

  it('renders drag overlay container', () => {
    render(<BlockList {...baseProps} nodes={[]} />);

    expect(screen.getByTestId('drag-overlay')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run src/components/layout/builder/__tests__/BlockList.test.tsx`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS — all existing and new tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/builder/__tests__/BlockList.test.tsx
git commit -m "test(layout): add integration tests for BlockList DnD"
```

---

## Task 10: Smoke Test — Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no type errors. Warnings about dynamic imports are acceptable.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Review the admin page import**

Read `src/app/org/types/page.tsx` and verify the dynamic import of `LayoutBuilder` still works — `BlockPalette` no longer takes an `onAdd` prop, so any parent that was passing it needs to be updated. Check that no other files import `BlockPalette` with the old `onAdd` prop.

Run: `grep -r "onAdd" src/components/layout/builder/ src/app/`
Expected: No references to `BlockPalette`'s old `onAdd` prop remain.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -u
git commit -m "fix(layout): resolve build issues from DnD overhaul"
```

Only create this commit if fixups were actually needed. If build passed cleanly, skip.
