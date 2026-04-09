# Drag & Drop Preview Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split builder/preview layout editor with a unified editing surface where the live preview IS the editor — users drag components directly into the rendered preview.

**Architecture:** Editable Renderer approach — create `EditableLayoutRenderer` that reuses `LayoutRendererV2`'s `renderBlockContent()` function but wraps each block with droppable/draggable wrappers and inserts drop zones between blocks. A new `LayoutEditor` orchestrates the DnD context, component drawer, config drawer, and edit mode toggle. The existing `LayoutRendererV2` and all block components stay untouched.

**Tech Stack:** React 18, @dnd-kit/core + @dnd-kit/sortable, TypeScript, Tailwind CSS, V2 layout types (TypeLayoutV2, LayoutBlockV2, LayoutRowV2, BlockTypeV2)

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/hooks/useLayoutHistory.ts` | Undo/redo hook with past/future stacks, max 30 entries |
| `src/components/layout/builder/SideDropZone.tsx` | Left/right edge drop zones on blocks for auto-row creation |
| `src/components/layout/builder/EditableBlock.tsx` | Draggable/selectable wrapper around rendered block content |
| `src/components/layout/builder/EditableRow.tsx` | Editable row wrapper with horizontal drop zones between children |
| `src/components/layout/builder/EditableLayoutRenderer.tsx` | Preview-as-editor: renders blocks via `renderBlockContent()` wrapped in `EditableBlock` + vertical `DropZone` between them |
| `src/components/layout/builder/ComponentDrawer.tsx` | Desktop: vertical sidebar. Mobile: FAB + expandable bottom sheet |
| `src/components/layout/builder/ConfigDrawer.tsx` | Bottom-sheet config panel for selected block |
| `src/components/layout/builder/BlockToolbar.tsx` | Floating toolbar above selected block (drag/config/delete) |
| `src/components/layout/builder/LayoutEditor.tsx` | Top-level orchestrator replacing `LayoutBuilderV2` |

### Modified files

| File | Change |
|---|---|
| `src/components/layout/builder/DropZone.tsx` | Reduce collapsed size from 8px to 4px |
| `src/components/layout/builder/collision.ts` | Add side-zone priority to collision detection |
| `src/components/layout/LayoutRendererV2.tsx` | Export `renderBlockContent()` function for reuse |
| `src/app/admin/properties/[slug]/types/page.tsx` | Swap `LayoutBuilderV2` import for `LayoutEditor` |

### Test files

| File | Tests |
|---|---|
| `src/hooks/__tests__/useLayoutHistory.test.ts` | Undo/redo push/pop, max 30 cap, reset on new initial |
| `src/components/layout/builder/__tests__/SideDropZone.test.tsx` | Renders left/right zones, expands on hover, disabled state |
| `src/components/layout/builder/__tests__/EditableBlock.test.tsx` | Draggable, selectable, hover affordances, drag handle |
| `src/components/layout/builder/__tests__/collision-v2.test.ts` | Side zones get priority, row-internal second, top-level third |
| `src/components/layout/builder/__tests__/ConfigDrawer.test.tsx` | Opens/closes, renders config per block type, live updates |
| `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx` | Desktop sidebar vs mobile FAB, drag source data, tap-to-add |
| `src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx` | Renders blocks with drop zones, edit mode affordances |
| `src/components/layout/builder/__tests__/LayoutEditor.test.tsx` | Edit toggle, DnD integration, save/cancel, undo/redo |

---

## Task 1: useLayoutHistory Hook

**Files:**
- Create: `src/hooks/useLayoutHistory.ts`
- Test: `src/hooks/__tests__/useLayoutHistory.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/hooks/__tests__/useLayoutHistory.test.ts
import { renderHook, act } from '@testing-library/react';
import { useLayoutHistory } from '../useLayoutHistory';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';

const makeLayout = (blockCount: number): TypeLayoutV2 => ({
  version: 2,
  blocks: Array.from({ length: blockCount }, (_, i) => ({
    id: `block-${i}`,
    type: 'divider' as const,
    config: {},
  })),
  spacing: 'comfortable',
  peekBlockCount: 3,
});

describe('useLayoutHistory', () => {
  it('returns initial layout as current', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    expect(result.current.layout).toBe(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('pushes to history on update', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    expect(result.current.layout).toBe(next);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undoes to previous state', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    act(() => result.current.undo());
    expect(result.current.layout).toEqual(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redoes after undo', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.layout).toEqual(next);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('clears future on new update after undo', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    act(() => result.current.update(makeLayout(2)));
    act(() => result.current.undo());
    act(() => result.current.update(makeLayout(3)));
    expect(result.current.canRedo).toBe(false);
  });

  it('caps history at 30 entries', () => {
    const initial = makeLayout(0);
    const { result } = renderHook(() => useLayoutHistory(initial));
    for (let i = 1; i <= 35; i++) {
      act(() => result.current.update(makeLayout(i)));
    }
    // Should be able to undo 30 times (max), not 35
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      undoCount++;
    }
    expect(undoCount).toBe(30);
  });

  it('hasUnsavedChanges compares to initial', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    expect(result.current.hasUnsavedChanges).toBe(false);
    act(() => result.current.update(makeLayout(2)));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.undo());
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/hooks/__tests__/useLayoutHistory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useLayoutHistory.ts
'use client';

import { useCallback, useRef, useState } from 'react';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';

const MAX_HISTORY = 30;

export function useLayoutHistory(initialLayout: TypeLayoutV2) {
  const initialRef = useRef(initialLayout);
  const [layout, setLayout] = useState(initialLayout);
  const pastRef = useRef<TypeLayoutV2[]>([]);
  const futureRef = useRef<TypeLayoutV2[]>([]);
  const [, forceRender] = useState(0);

  const update = useCallback((next: TypeLayoutV2) => {
    setLayout((current) => {
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), current];
      futureRef.current = [];
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    setLayout((current) => {
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      return prev;
    });
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    setLayout((current) => {
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const hasUnsavedChanges = layout !== initialRef.current && JSON.stringify(layout) !== JSON.stringify(initialRef.current);

  return { layout, update, undo, redo, canUndo, canRedo, hasUnsavedChanges };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/hooks/__tests__/useLayoutHistory.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/hooks/useLayoutHistory.ts src/hooks/__tests__/useLayoutHistory.test.ts
git commit -m "feat: add useLayoutHistory hook for undo/redo"
```

---

## Task 2: Update DropZone Collapsed Size

**Files:**
- Modify: `src/components/layout/builder/DropZone.tsx:14`
- Modify: `src/components/layout/builder/__tests__/DropZone.test.tsx`

- [ ] **Step 1: Update the collapsed size constant**

In `src/components/layout/builder/DropZone.tsx`, change:

```typescript
const COLLAPSED_SIZE = '8px';
```

to:

```typescript
const COLLAPSED_SIZE = '4px';
```

- [ ] **Step 2: Update the existing test**

In `src/components/layout/builder/__tests__/DropZone.test.tsx`, update any assertion checking for `8px` to check for `4px` instead.

- [ ] **Step 3: Run tests**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/DropZone.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/DropZone.tsx src/components/layout/builder/__tests__/DropZone.test.tsx
git commit -m "fix: reduce DropZone collapsed size to 4px"
```

---

## Task 3: SideDropZone Component

**Files:**
- Create: `src/components/layout/builder/SideDropZone.tsx`
- Test: `src/components/layout/builder/__tests__/SideDropZone.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/builder/__tests__/SideDropZone.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SideDropZone from '../SideDropZone';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn((args: { id: string; data: unknown; disabled?: boolean }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
}));

describe('SideDropZone', () => {
  it('renders with correct side data', () => {
    const { useDroppable } = require('@dnd-kit/core');
    render(
      <SideDropZone
        id="side-left-block1"
        side="left"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    expect(useDroppable).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'side-left-block1',
        data: {
          zone: 'side',
          side: 'left',
          blockId: 'block1',
          blockIndex: 0,
          isInRow: false,
        },
        disabled: false,
      })
    );
  });

  it('has 20px width and full height', () => {
    const { container } = render(
      <SideDropZone
        id="side-right-block1"
        side="right"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('20px');
    expect(el.style.position).toBe('absolute');
  });

  it('is positioned left when side is left', () => {
    const { container } = render(
      <SideDropZone
        id="side-left-block1"
        side="left"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).toBe('0px');
  });

  it('is positioned right when side is right', () => {
    const { container } = render(
      <SideDropZone
        id="side-right-block1"
        side="right"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.right).toBe('0px');
  });

  it('shows highlight when hovered', () => {
    const { useDroppable } = require('@dnd-kit/core');
    useDroppable.mockReturnValueOnce({ setNodeRef: vi.fn(), isOver: true });
    const { container } = render(
      <SideDropZone
        id="side-left-block1"
        side="left"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={false}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('bg-forest/10');
  });

  it('passes disabled when in a full row', () => {
    const { useDroppable } = require('@dnd-kit/core');
    render(
      <SideDropZone
        id="side-left-block1"
        side="left"
        parentBlockId="block1"
        parentBlockIndex={0}
        isInRow={false}
        disabled={true}
      />
    );
    expect(useDroppable).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: true })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/SideDropZone.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SideDropZone**

```typescript
// src/components/layout/builder/SideDropZone.tsx
'use client';

import { useDroppable } from '@dnd-kit/core';

interface SideDropZoneProps {
  id: string;
  side: 'left' | 'right';
  parentBlockId: string;
  parentBlockIndex: number;
  isInRow: boolean;
  disabled: boolean;
}

export default function SideDropZone({
  id,
  side,
  parentBlockId,
  parentBlockIndex,
  isInRow,
  disabled,
}: SideDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      zone: 'side',
      side,
      blockId: parentBlockId,
      blockIndex: parentBlockIndex,
      isInRow,
    },
    disabled,
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    [side]: 0,
    width: '20px',
    height: '100%',
    zIndex: 10,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`transition-colors duration-150 rounded ${
        isOver && !disabled ? 'bg-forest/10' : ''
      }`}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/SideDropZone.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/SideDropZone.tsx src/components/layout/builder/__tests__/SideDropZone.test.tsx
git commit -m "feat: add SideDropZone for auto-row creation"
```

---

## Task 4: Update Collision Detection with Side Zone Priority

**Files:**
- Modify: `src/components/layout/builder/collision.ts`
- Test: `src/components/layout/builder/__tests__/collision.test.ts`

- [ ] **Step 1: Add failing tests for side zone priority**

Append to `src/components/layout/builder/__tests__/collision.test.ts`:

```typescript
describe('side zone priority', () => {
  it('prioritizes side zones over top-level zones', () => {
    const sideZone = createContainer('side-left-block1', {
      zone: 'side',
      side: 'left',
      blockId: 'block1',
      blockIndex: 0,
    });
    const topZone = createContainer('drop-0', {
      zone: 'top-level',
      index: 0,
    });

    const result = rowAwareCollision({
      active: createActive('palette-field_display'),
      collisionRect: { ...baseRect },
      droppableContainers: [sideZone, topZone],
      droppableRects: new Map([
        ['side-left-block1', { ...baseRect, left: 100, right: 120, top: 50, bottom: 150, width: 20, height: 100 }],
        ['drop-0', { ...baseRect, left: 0, right: 400, top: 45, bottom: 55, width: 400, height: 10 }],
      ]),
      pointerCoordinates: { x: 110, y: 100 },
    });

    expect(result[0]?.id).toBe('side-left-block1');
  });

  it('falls back to top-level when pointer not in side zone', () => {
    const sideZone = createContainer('side-left-block1', {
      zone: 'side',
      side: 'left',
      blockId: 'block1',
      blockIndex: 0,
    });
    const topZone = createContainer('drop-0', {
      zone: 'top-level',
      index: 0,
    });

    const result = rowAwareCollision({
      active: createActive('palette-field_display'),
      collisionRect: { ...baseRect },
      droppableContainers: [sideZone, topZone],
      droppableRects: new Map([
        ['side-left-block1', { ...baseRect, left: 0, right: 20, top: 50, bottom: 150, width: 20, height: 100 }],
        ['drop-0', { ...baseRect, left: 0, right: 400, top: 200, bottom: 210, width: 400, height: 10 }],
      ]),
      pointerCoordinates: { x: 200, y: 205 },
    });

    expect(result[0]?.id).toBe('drop-0');
  });
});
```

Note: You'll need to adapt the test helper functions (`createContainer`, `createActive`, `baseRect`) to match the existing test file's patterns. Read the existing test file first and use the same helpers.

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/collision.test.ts`
Expected: New side zone tests FAIL

- [ ] **Step 3: Update collision detection**

In `src/components/layout/builder/collision.ts`, update the `rowAwareCollision` function to add side zones as a third category with highest priority. After the existing row-zone check block, add side-zone handling before the top-level fallback:

```typescript
export const rowAwareCollision: CollisionDetection = ({
  active,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates || droppableContainers.length === 0) return [];

  const { x, y } = pointerCoordinates;
  const activeData = active?.data?.current as Record<string, unknown> | undefined;
  const isDraggingRow = activeData?.isRow === true;

  // Separate zone types
  const sideZones: DroppableContainer[] = [];
  const rowZones: DroppableContainer[] = [];
  const topLevelZones: DroppableContainer[] = [];

  for (const container of droppableContainers) {
    const data = container.data?.current as Record<string, unknown> | undefined;
    if (!data) continue;
    if (data.zone === 'side') {
      sideZones.push(container);
    } else if (data.zone === 'row') {
      rowZones.push(container);
    } else if (data.zone === 'top-level') {
      topLevelZones.push(container);
    }
  }

  // Side zones: highest priority. Check if pointer is inside any side zone rect.
  if (!isDraggingRow && sideZones.length > 0) {
    for (const zone of sideZones) {
      const rect = droppableRects.get(zone.id);
      if (!rect) continue;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return [{ id: zone.id, data: { droppableContainer: zone, value: 0 } }];
      }
    }
  }

  // Row-internal zones: prioritize when inside row bounds
  if (!isDraggingRow) {
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
  }

  // Fall back to top-level zones
  return closestByDistance(topLevelZones, droppableRects, pointerCoordinates);
};
```

- [ ] **Step 4: Run all collision tests**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/collision.test.ts`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/collision.ts src/components/layout/builder/__tests__/collision.test.ts
git commit -m "feat: add side zone priority to collision detection"
```

---

## Task 5: Export renderBlockContent from LayoutRendererV2

**Files:**
- Modify: `src/components/layout/LayoutRendererV2.tsx`

- [ ] **Step 1: Export the renderBlockContent function**

In `src/components/layout/LayoutRendererV2.tsx`, add `export` to the `renderBlockContent` function declaration (line 105):

Change:
```typescript
function renderBlockContent(
```
to:
```typescript
export function renderBlockContent(
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/DragOverlayContent.test.tsx`
Expected: PASS (DragOverlayContent uses LayoutRendererDispatch which uses LayoutRendererV2)

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/LayoutRendererV2.tsx
git commit -m "refactor: export renderBlockContent from LayoutRendererV2"
```

---

## Task 6: EditableBlock Component

**Files:**
- Create: `src/components/layout/builder/EditableBlock.tsx`
- Test: `src/components/layout/builder/__tests__/EditableBlock.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/builder/__tests__/EditableBlock.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EditableBlock from '../EditableBlock';

const mockUseDraggable = vi.fn(() => ({
  attributes: { role: 'button', tabIndex: 0 },
  listeners: {},
  setNodeRef: vi.fn(),
  isDragging: false,
}));

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: (...args: unknown[]) => mockUseDraggable(...args),
}));

describe('EditableBlock', () => {
  const defaultProps = {
    blockId: 'block-1',
    blockIndex: 0,
    isInRow: false,
    isSelected: false,
    isDragDisabled: false,
    rowChildCount: 0,
    onSelect: vi.fn(),
    onOpenConfig: vi.fn(),
    onDelete: vi.fn(),
    children: <div data-testid="block-content">Content</div>,
  };

  it('renders children', () => {
    render(<EditableBlock {...defaultProps} />);
    expect(screen.getByTestId('block-content')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<EditableBlock {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('block-content').parentElement!.closest('[data-block-id]')!);
    expect(onSelect).toHaveBeenCalledWith('block-1');
  });

  it('shows selected border when isSelected', () => {
    const { container } = render(<EditableBlock {...defaultProps} isSelected={true} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('border-forest');
  });

  it('shows dashed border on hover when not selected', () => {
    const { container } = render(<EditableBlock {...defaultProps} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('hover:border-sage/40');
  });

  it('reduces opacity when dragging', () => {
    mockUseDraggable.mockReturnValueOnce({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
    });
    const { container } = render(<EditableBlock {...defaultProps} />);
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toContain('opacity-25');
  });

  it('includes side drop zones when not in row', () => {
    const { container } = render(<EditableBlock {...defaultProps} isInRow={false} />);
    // Side zones are absolutely positioned children
    const sideZones = container.querySelectorAll('[style*="position: absolute"]');
    expect(sideZones.length).toBe(2); // left and right
  });

  it('includes side drop zones when in row (redirects to parent)', () => {
    const { container } = render(<EditableBlock {...defaultProps} isInRow={true} />);
    const sideZones = container.querySelectorAll('[style*="position: absolute"]');
    expect(sideZones.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/EditableBlock.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement EditableBlock**

```typescript
// src/components/layout/builder/EditableBlock.tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import SideDropZone from './SideDropZone';
import BlockToolbar from './BlockToolbar';

interface EditableBlockProps {
  blockId: string;
  blockIndex: number;
  isInRow: boolean;
  isSelected: boolean;
  isDragDisabled: boolean;
  rowChildCount: number;
  onSelect: (blockId: string) => void;
  onOpenConfig: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  children: React.ReactNode;
}

export default function EditableBlock({
  blockId,
  blockIndex,
  isInRow,
  isSelected,
  isDragDisabled,
  rowChildCount,
  onSelect,
  onOpenConfig,
  onDelete,
  children,
}: EditableBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: blockId,
    disabled: isDragDisabled,
  });

  const sideZonesDisabled = isInRow && rowChildCount >= 4;

  return (
    <div
      data-block-id={blockId}
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(blockId);
      }}
      className={`group relative rounded-lg transition-all duration-150 border-2 ${
        isDragging
          ? 'opacity-25 border-transparent'
          : isSelected
            ? 'border-forest'
            : 'border-transparent hover:border-dashed hover:border-sage/40'
      }`}
    >
      {/* Floating toolbar — shown when selected */}
      {isSelected && !isDragging && (
        <BlockToolbar
          onConfig={() => onOpenConfig(blockId)}
          onDelete={() => onDelete(blockId)}
          dragListeners={listeners}
          dragAttributes={attributes}
        />
      )}

      {/* Side drop zones for auto-row creation */}
      <SideDropZone
        id={`side-left-${blockId}`}
        side="left"
        parentBlockId={blockId}
        parentBlockIndex={blockIndex}
        isInRow={isInRow}
        disabled={sideZonesDisabled}
      />
      <SideDropZone
        id={`side-right-${blockId}`}
        side="right"
        parentBlockId={blockId}
        parentBlockIndex={blockIndex}
        isInRow={isInRow}
        disabled={sideZonesDisabled}
      />

      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/EditableBlock.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/EditableBlock.tsx src/components/layout/builder/__tests__/EditableBlock.test.tsx
git commit -m "feat: add EditableBlock draggable/selectable wrapper"
```

---

## Task 7: BlockToolbar Component

**Files:**
- Create: `src/components/layout/builder/BlockToolbar.tsx`

- [ ] **Step 1: Implement BlockToolbar**

```typescript
// src/components/layout/builder/BlockToolbar.tsx
'use client';

import { GripVertical, Settings, Trash2 } from 'lucide-react';

interface BlockToolbarProps {
  onConfig: () => void;
  onDelete: () => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
}

export default function BlockToolbar({
  onConfig,
  onDelete,
  dragListeners,
  dragAttributes,
}: BlockToolbarProps) {
  return (
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-sage-light px-1 py-0.5">
      <button
        {...dragAttributes}
        {...dragListeners}
        className="p-1.5 rounded hover:bg-sage-light/50 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} className="text-sage" />
      </button>
      <button
        onClick={onConfig}
        className="p-1.5 rounded hover:bg-sage-light/50"
        aria-label="Configure block"
      >
        <Settings size={14} className="text-sage" />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded hover:bg-red-50"
        aria-label="Delete block"
      >
        <Trash2 size={14} className="text-red-400" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/BlockToolbar.tsx
git commit -m "feat: add BlockToolbar floating action bar"
```

---

## Task 8: EditableRow Component

**Files:**
- Create: `src/components/layout/builder/EditableRow.tsx`

- [ ] **Step 1: Implement EditableRow**

This wraps a `LayoutRowV2` in the editable preview. It renders its children with horizontal drop zones between them, wrapped in `EditableBlock` components. It also renders the row with a faint dashed border so the user can see row boundaries.

```typescript
// src/components/layout/builder/EditableRow.tsx
'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { LayoutRowV2, LayoutBlockV2 } from '@/lib/layout/types-v2';
import DropZone from './DropZone';
import RowBlockV2 from '../blocks/RowBlockV2';

interface EditableRowProps {
  row: LayoutRowV2;
  rowIndex: number;
  selectedBlockId: string | null;
  isDragActive: boolean;
  onSelect: (blockId: string) => void;
  renderBlock: (block: LayoutBlockV2, index: number, isInRow: boolean, rowChildCount: number) => React.ReactNode;
}

export default function EditableRow({
  row,
  rowIndex,
  selectedBlockId,
  isDragActive,
  onSelect,
  renderBlock,
}: EditableRowProps) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: row.id,
    data: { isRow: true },
  });

  // Row bounds droppable for collision detection
  const { setNodeRef: boundsRef } = useDroppable({
    id: `row-bounds-${row.id}`,
    data: { zone: 'row-bounds', rowId: row.id },
    disabled: true, // Only used for collision rect, not as actual drop target
  });

  const maxChildren = 4;
  const isFull = row.children.length >= maxChildren;

  return (
    <div
      ref={(el) => {
        dragRef(el);
        boundsRef(el);
      }}
      className={`relative rounded-lg transition-all duration-150 ${
        isDragging ? 'opacity-25' : ''
      } ${isDragActive ? 'border border-dashed border-sage/20' : ''}`}
    >
      {/* Drag handle for the row */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-1 -left-1 z-20 opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none p-1"
        aria-label="Drag to reorder row"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-sage">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </div>

      <div className="flex items-stretch" style={{ gap: row.gap === 'tight' ? 4 : row.gap === 'loose' ? 16 : 8 }}>
        {/* Horizontal drop zone before first child */}
        {isDragActive && (
          <DropZone
            id={`row-${row.id}-drop-0`}
            data={{ zone: 'row', rowId: row.id, index: 0 }}
            direction="horizontal"
            disabled={isFull}
          />
        )}

        {row.children.map((child, childIndex) => (
          <div key={child.id} className="flex items-stretch" style={{ flex: child.width === 'full' ? 1 : undefined, width: widthToPercent(child.width) }}>
            {renderBlock(child, childIndex, true, row.children.length)}

            {/* Horizontal drop zone after each child */}
            {isDragActive && (
              <DropZone
                id={`row-${row.id}-drop-${childIndex + 1}`}
                data={{ zone: 'row', rowId: row.id, index: childIndex + 1 }}
                direction="horizontal"
                disabled={isFull}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function widthToPercent(width?: string): string | undefined {
  if (!width || width === 'full') return undefined;
  const map: Record<string, string> = {
    '1/4': '25%',
    '1/3': '33.333%',
    '1/2': '50%',
    '2/3': '66.667%',
    '3/4': '75%',
  };
  return map[width];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/EditableRow.tsx
git commit -m "feat: add EditableRow with horizontal drop zones"
```

---

## Task 9: EditableLayoutRenderer

**Files:**
- Create: `src/components/layout/builder/EditableLayoutRenderer.tsx`
- Test: `src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
}));

vi.mock('../../LayoutRendererV2', () => ({
  renderBlockContent: vi.fn((block: { type: string }) => (
    <div data-testid={`block-${block.type}`}>{block.type}</div>
  )),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'admin' }),
}));

import EditableLayoutRenderer from '../EditableLayoutRenderer';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';

const mockLayout: TypeLayoutV2 = {
  version: 2,
  blocks: [
    { id: 'b1', type: 'status_badge', config: {} },
    { id: 'b2', type: 'divider', config: {} },
  ],
  spacing: 'comfortable',
  peekBlockCount: 3,
};

const mockItem = { id: '1', name: 'Test', status: 'active' } as unknown as ItemWithDetails;
const mockFields: CustomField[] = [];

describe('EditableLayoutRenderer', () => {
  it('renders blocks wrapped in editable containers', () => {
    const { container } = render(
      <EditableLayoutRenderer
        layout={mockLayout}
        item={mockItem}
        customFields={mockFields}
        selectedBlockId={null}
        isDragActive={false}
        onSelect={vi.fn()}
        onOpenConfig={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByTestId('block-status_badge')).toBeInTheDocument();
    expect(screen.getByTestId('block-divider')).toBeInTheDocument();
    // Check for data-block-id attributes from EditableBlock
    expect(container.querySelector('[data-block-id="b1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-block-id="b2"]')).toBeInTheDocument();
  });

  it('renders vertical drop zones between blocks when drag is active', () => {
    const { container } = render(
      <EditableLayoutRenderer
        layout={mockLayout}
        item={mockItem}
        customFields={mockFields}
        selectedBlockId={null}
        isDragActive={true}
        onSelect={vi.fn()}
      />
    );
    // 2 blocks = 3 drop zones (before, between, after)
    // Drop zones have a specific collapsed height style
    const dropZones = container.querySelectorAll('[style*="height: 4px"]');
    expect(dropZones.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement EditableLayoutRenderer**

```typescript
// src/components/layout/builder/EditableLayoutRenderer.tsx
'use client';

import React from 'react';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2 } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { SPACING } from '@/lib/layout/spacing';
import { renderBlockContent } from '../LayoutRendererV2';
import BlockErrorBoundary from '../BlockErrorBoundary';
import EditableBlock from './EditableBlock';
import EditableRow from './EditableRow';
import DropZone from './DropZone';

interface EditableLayoutRendererProps {
  layout: TypeLayoutV2;
  item: ItemWithDetails;
  customFields: CustomField[];
  selectedBlockId: string | null;
  isDragActive: boolean;
  onSelect: (blockId: string) => void;
  onOpenConfig: (blockId: string) => void;
  onDelete: (blockId: string) => void;
}

export default function EditableLayoutRenderer({
  layout,
  item,
  customFields,
  selectedBlockId,
  isDragActive,
  onSelect,
  onOpenConfig,
  onDelete,
}: EditableLayoutRendererProps) {
  const spacing = SPACING[layout.spacing];

  const rendererProps = {
    layout,
    item,
    mode: 'preview' as const,
    context: 'preview' as const,
    customFields,
  };

  const renderEditableBlock = (
    block: LayoutBlockV2,
    index: number,
    isInRow: boolean,
    rowChildCount: number,
  ) => (
    <EditableBlock
      key={block.id}
      blockId={block.id}
      blockIndex={index}
      isInRow={isInRow}
      isSelected={selectedBlockId === block.id}
      isDragDisabled={false}
      rowChildCount={rowChildCount}
      onSelect={onSelect}
      onOpenConfig={onOpenConfig}
      onDelete={onDelete}
    >
      <BlockErrorBoundary blockType={block.type}>
        {renderBlockContent(block, index, rendererProps)}
      </BlockErrorBoundary>
    </EditableBlock>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.blockGap }}>
      {/* Drop zone before first block */}
      {isDragActive && (
        <DropZone
          id="drop-top-0"
          data={{ zone: 'top-level', index: 0 }}
          direction="vertical"
        />
      )}

      {layout.blocks.map((node, index) => (
        <React.Fragment key={node.id}>
          {isLayoutRowV2(node) ? (
            <EditableRow
              row={node}
              rowIndex={index}
              selectedBlockId={selectedBlockId}
              isDragActive={isDragActive}
              onSelect={onSelect}
              renderBlock={renderEditableBlock}
            />
          ) : (
            renderEditableBlock(node as LayoutBlockV2, index, false, 0)
          )}

          {/* Drop zone after each block */}
          {isDragActive && (
            <DropZone
              id={`drop-top-${index + 1}`}
              data={{ zone: 'top-level', index: index + 1 }}
              direction="vertical"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/EditableLayoutRenderer.tsx src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx
git commit -m "feat: add EditableLayoutRenderer preview-as-editor"
```

---

## Task 10: ComponentDrawer — Desktop Sidebar + Mobile FAB

**Files:**
- Create: `src/components/layout/builder/ComponentDrawer.tsx`
- Test: `src/components/layout/builder/__tests__/ComponentDrawer.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/builder/__tests__/ComponentDrawer.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ComponentDrawer from '../ComponentDrawer';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: vi.fn((args: { id: string; data: unknown }) => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
}));

describe('ComponentDrawer', () => {
  const defaultProps = {
    isMobile: false,
    disabledTypes: new Set<string>(),
    onQuickAdd: vi.fn(),
  };

  it('renders vertical sidebar on desktop', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={false} />);
    // All 10 block types should be visible (no "Row" — removed from palette)
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Row')).not.toBeInTheDocument();
  });

  it('renders FAB on mobile', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={true} />);
    expect(screen.getByLabelText('Add component')).toBeInTheDocument();
  });

  it('expands mobile drawer on FAB tap', () => {
    render(<ComponentDrawer {...defaultProps} isMobile={true} />);
    fireEvent.click(screen.getByLabelText('Add component'));
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  it('calls onQuickAdd when chip tapped on mobile', () => {
    const onQuickAdd = vi.fn();
    render(<ComponentDrawer {...defaultProps} isMobile={true} onQuickAdd={onQuickAdd} />);
    fireEvent.click(screen.getByLabelText('Add component'));
    fireEvent.click(screen.getByText('Divider'));
    expect(onQuickAdd).toHaveBeenCalledWith('divider');
  });

  it('disables description chip when in disabledTypes', () => {
    render(
      <ComponentDrawer {...defaultProps} disabledTypes={new Set(['description'])} />
    );
    const descChip = screen.getByText('Description').closest('[aria-label]');
    expect(descChip?.className).toContain('opacity-40');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/ComponentDrawer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ComponentDrawer**

```typescript
// src/components/layout/builder/ComponentDrawer.tsx
'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Plus, X } from 'lucide-react';
import type { BlockTypeV2 } from '@/lib/layout/types-v2';

interface PaletteItem {
  type: BlockTypeV2;
  icon: string;
  label: string;
}

// No "Row" — rows are created via side-drop
const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'description', icon: '📝', label: 'Description' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
];

interface Props {
  isMobile: boolean;
  disabledTypes: Set<string>;
  onQuickAdd: (type: BlockTypeV2) => void;
}

function DraggableChip({
  item,
  disabled,
  isMobile,
  onTap,
}: {
  item: PaletteItem;
  disabled: boolean;
  isMobile: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, source: 'palette' },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(isMobile ? {} : listeners)}
      onClick={(e) => {
        if (isMobile && !disabled) {
          e.stopPropagation();
          onTap();
        }
      }}
      onPointerDown={(e) => {
        if (isMobile && listeners?.onPointerDown) {
          // Long-press handled by touch sensor
          (listeners.onPointerDown as (e: React.PointerEvent) => void)(e);
        }
      }}
      aria-label={`${isMobile ? 'Tap to add' : 'Drag to add'} ${item.label}`}
      className={`flex items-center gap-2 rounded-lg border border-sage-light bg-white text-sm font-medium text-forest-dark transition-colors select-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isMobile
            ? 'active:bg-sage-light/50 min-h-[44px] px-3 py-2'
            : 'hover:bg-sage-light/50 cursor-grab active:cursor-grabbing touch-none px-3 py-2.5 w-full'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

export default function ComponentDrawer({ isMobile, disabledTypes, onQuickAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isMobile) {
    // Desktop: vertical sidebar
    return (
      <div className="flex flex-col gap-1.5 w-[140px] flex-shrink-0">
        {PALETTE_ITEMS.map((item) => (
          <DraggableChip
            key={item.type}
            item={item}
            disabled={disabledTypes.has(item.type)}
            isMobile={false}
            onTap={() => {}}
          />
        ))}
      </div>
    );
  }

  // Mobile: FAB + expandable drawer
  return (
    <>
      {/* FAB */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Add component"
          className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-forest text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Plus size={24} />
        </button>
      )}

      {/* Drawer backdrop + sheet */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[50vh] overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
              <span className="font-medium text-forest-dark">Add Component</span>
              <button onClick={() => setIsOpen(false)} aria-label="Close drawer">
                <X size={20} className="text-sage" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {PALETTE_ITEMS.map((item) => (
                <DraggableChip
                  key={item.type}
                  item={item}
                  disabled={disabledTypes.has(item.type)}
                  isMobile={true}
                  onTap={() => {
                    onQuickAdd(item.type);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/ComponentDrawer.test.tsx`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/ComponentDrawer.tsx src/components/layout/builder/__tests__/ComponentDrawer.test.tsx
git commit -m "feat: add ComponentDrawer with desktop sidebar and mobile FAB"
```

---

## Task 11: ConfigDrawer — Bottom Sheet Config Panel

**Files:**
- Create: `src/components/layout/builder/ConfigDrawer.tsx`
- Test: `src/components/layout/builder/__tests__/ConfigDrawer.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/builder/__tests__/ConfigDrawer.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfigDrawer from '../ConfigDrawer';
import type { LayoutBlockV2 } from '@/lib/layout/types-v2';

describe('ConfigDrawer', () => {
  const onConfigChange = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const onCreateField = vi.fn();

  const fieldBlock: LayoutBlockV2 = {
    id: 'b1',
    type: 'field_display',
    config: { fieldId: 'f1', size: 'normal', showLabel: true },
  };

  const dividerBlock: LayoutBlockV2 = {
    id: 'b2',
    type: 'divider',
    config: {},
  };

  it('renders nothing when block is null', () => {
    const { container } = render(
      <ConfigDrawer
        block={null}
        customFields={[]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders config for field_display block', () => {
    render(
      <ConfigDrawer
        block={fieldBlock}
        customFields={[{ id: 'f1', name: 'Species', field_type: 'text', item_type_id: 't1', options: null, required: false, sort_order: 0, org_id: 'o1' }]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
  });

  it('shows no-config message for divider', () => {
    render(
      <ConfigDrawer
        block={dividerBlock}
        customFields={[]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    expect(screen.getByText(/no configuration/i)).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(
      <ConfigDrawer
        block={fieldBlock}
        customFields={[]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    fireEvent.click(screen.getByTestId('config-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onDelete with confirmation', () => {
    render(
      <ConfigDrawer
        block={fieldBlock}
        customFields={[]}
        entityTypes={[]}
        onConfigChange={onConfigChange}
        onDelete={onDelete}
        onClose={onClose}
        onCreateField={onCreateField}
      />
    );
    fireEvent.click(screen.getByText('Remove'));
    // Confirmation dialog
    fireEvent.click(screen.getByText('Yes, Remove'));
    expect(onDelete).toHaveBeenCalledWith('b1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/ConfigDrawer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ConfigDrawer**

```typescript
// src/components/layout/builder/ConfigDrawer.tsx
'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { LayoutBlockV2, BlockConfigV2 } from '@/lib/layout/types-v2';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanel from './BlockConfigPanel';

interface ConfigDrawerProps {
  block: LayoutBlockV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}

const BLOCK_LABELS: Record<string, string> = {
  field_display: 'Field',
  photo_gallery: 'Photo Gallery',
  status_badge: 'Status Badge',
  entity_list: 'Entity List',
  timeline: 'Timeline',
  text_label: 'Text Label',
  description: 'Description',
  divider: 'Divider',
  map_snippet: 'Map',
  action_buttons: 'Actions',
};

export default function ConfigDrawer({
  block,
  customFields,
  entityTypes,
  onConfigChange,
  onDelete,
  onClose,
  onCreateField,
}: ConfigDrawerProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!block) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="config-backdrop"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[50vh] overflow-y-auto mx-auto max-w-[480px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-sage-light rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-sage-light">
          <span className="font-medium text-forest-dark">
            {BLOCK_LABELS[block.type] ?? block.type}
          </span>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-sage" />
          </button>
        </div>

        {/* Config content */}
        <div className="px-4 py-3">
          <BlockConfigPanel
            block={block as any}
            customFields={customFields}
            entityTypes={entityTypes}
            onConfigChange={(id, config) => onConfigChange(id, config as BlockConfigV2)}
            onCreateField={onCreateField}
          />
        </div>

        {/* Delete */}
        <div className="px-4 py-3 border-t border-sage-light">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600">Remove this block?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete(block.id);
                    setShowDeleteConfirm(false);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                >
                  Yes, Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/ConfigDrawer.test.tsx`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/ConfigDrawer.tsx src/components/layout/builder/__tests__/ConfigDrawer.test.tsx
git commit -m "feat: add ConfigDrawer bottom sheet for block configuration"
```

---

## Task 12: LayoutEditor — Main Orchestrator

**Files:**
- Create: `src/components/layout/builder/LayoutEditor.tsx`

This is the largest task — the top-level component that wires everything together. It replaces `LayoutBuilderV2`.

- [ ] **Step 1: Implement LayoutEditor**

```typescript
// src/components/layout/builder/LayoutEditor.tsx
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';
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
import type { TypeLayout } from '@/lib/layout/types';
import type {
  TypeLayoutV2,
  LayoutNodeV2,
  LayoutBlockV2,
  LayoutRowV2,
  BlockTypeV2,
  BlockConfigV2,
  SpacingPreset,
  FractionalWidth,
  BlockPermissions,
} from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayoutV2 } from '@/lib/layout/defaults-v2';
import { migrateV1toV2 } from '@/lib/layout/migration';
import { generateMockItem } from '@/lib/layout/mock-data';
import { useLayoutHistory } from '@/hooks/useLayoutHistory';
import EditableLayoutRenderer from './EditableLayoutRenderer';
import ComponentDrawer from './ComponentDrawer';
import ConfigDrawer from './ConfigDrawer';
import LayoutRendererDispatch from '../LayoutRendererDispatch';
import FormPreview from '../preview/FormPreview';
import DragOverlayContent from './DragOverlayContent';
import { rowAwareCollision } from './collision';
import { Undo2, Redo2 } from 'lucide-react';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | TypeLayoutV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayoutV2, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

type PreviewTab = 'detail' | 'form';

function getDefaultConfig(type: BlockTypeV2): BlockConfigV2 {
  switch (type) {
    case 'field_display': return { fieldId: '', size: 'normal' as const, showLabel: true };
    case 'photo_gallery': return { style: 'hero' as const, maxPhotos: 4 };
    case 'timeline': return { showUpdates: true, showScheduled: false, maxItems: 5 };
    case 'text_label': return { text: 'Section Title', style: 'heading' as const };
    case 'entity_list': return { entityTypeIds: [] };
    case 'description': return { showLabel: true };
    default: return {};
  }
}

function createBlock(type: BlockTypeV2): LayoutBlockV2 {
  return { id: nanoid(10), type, config: getDefaultConfig(type) };
}

function findNode(nodes: LayoutNodeV2[], id: string): LayoutNodeV2 | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (isLayoutRowV2(node)) {
      const child = node.children.find((c) => c.id === id);
      if (child) return child;
    }
  }
  return null;
}

export default function LayoutEditor({
  itemType,
  initialLayout,
  customFields,
  entityTypes,
  onSave,
  onCancel,
}: Props) {
  const resolvedInitial = useMemo<TypeLayoutV2>(() => {
    if (!initialLayout) return generateDefaultLayoutV2(customFields);
    if (initialLayout.version === 2) return initialLayout as TypeLayoutV2;
    return migrateV1toV2(initialLayout as TypeLayout);
  }, [initialLayout, customFields]);

  const { layout, update: setLayout, undo, redo, canUndo, canRedo, hasUnsavedChanges } = useLayoutHistory(resolvedInitial);
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [configBlock, setConfigBlock] = useState<LayoutBlockV2 | null>(null);
  const [activeNode, setActiveNode] = useState<LayoutNodeV2 | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape') {
        if (configBlock) {
          setConfigBlock(null);
        } else if (selectedBlockId) {
          setSelectedBlockId(null);
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId && !configBlock) {
        handleDeleteBlock(selectedBlockId);
        setSelectedBlockId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, configBlock, selectedBlockId]);

  const allFields = useMemo<CustomField[]>(() => [
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
  ], [customFields, pendingFields, itemType.id, itemType.org_id]);

  const mockItem = useMemo(() => generateMockItem(itemType, allFields), [itemType, allFields]);

  const disabledTypes = useMemo(() => {
    const set = new Set<string>();
    const hasDesc = layout.blocks.some((n) =>
      n.type === 'description' || (isLayoutRowV2(n) && n.children.some((c) => c.type === 'description'))
    );
    if (hasDesc) set.add('description');
    return set;
  }, [layout.blocks]);

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;
    setConfigBlock(null); // Auto-dismiss config drawer

    if (data?.source === 'palette') {
      const paletteType = data.type as BlockTypeV2;
      setActiveNode(createBlock(paletteType));
      return;
    }

    const id = String(active.id);
    const found = findNode(layout.blocks, id);
    if (found) setActiveNode(found);
  }, [layout.blocks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNode(null);

    if (!over) return;

    const activeData = active.data.current as Record<string, unknown>;
    const overData = over.data.current as Record<string, unknown>;

    if (overData?.zone) {
      handleDrop(String(active.id), activeData ?? {}, overData);
    }
  }, []);

  const handleDrop = useCallback((activeId: string, activeData: Record<string, unknown>, targetData: Record<string, unknown>) => {
    const isPalette = activeData.source === 'palette';
    const targetZone = targetData.zone as string;
    const targetIndex = targetData.index as number;

    const newLayout = { ...layout, blocks: [...layout.blocks] };
    const blocks = newLayout.blocks;

    if (isPalette) {
      const paletteType = activeData.type as BlockTypeV2;
      const newBlock = createBlock(paletteType);

      if (targetZone === 'top-level') {
        blocks.splice(targetIndex, 0, newBlock);
      } else if (targetZone === 'row') {
        const rowId = targetData.rowId as string;
        const rowIdx = blocks.findIndex((b) => b.id === rowId);
        if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
          const row = blocks[rowIdx] as LayoutRowV2;
          if (row.children.length < 4) {
            const children = [...row.children];
            children.splice(targetIndex, 0, { ...newBlock, width: '1/2' as FractionalWidth });
            blocks[rowIdx] = { ...row, children };
          }
        }
      } else if (targetZone === 'side') {
        const blockId = targetData.blockId as string;
        const side = targetData.side as 'left' | 'right';
        const isInRow = targetData.isInRow as boolean;
        const blockIndex = targetData.blockIndex as number;

        if (isInRow) {
          // Redirect to parent row insert
          for (let i = 0; i < blocks.length; i++) {
            if (isLayoutRowV2(blocks[i])) {
              const row = blocks[i] as LayoutRowV2;
              const childIdx = row.children.findIndex((c) => c.id === blockId);
              if (childIdx !== -1 && row.children.length < 4) {
                const children = [...row.children];
                const insertIdx = side === 'left' ? childIdx : childIdx + 1;
                children.splice(insertIdx, 0, { ...newBlock, width: '1/2' as FractionalWidth });
                blocks[i] = { ...row, children };
                break;
              }
            }
          }
        } else {
          // Auto-create row from standalone block
          const topIdx = blocks.findIndex((b) => b.id === blockId);
          if (topIdx !== -1 && !isLayoutRowV2(blocks[topIdx])) {
            const existingBlock = blocks[topIdx] as LayoutBlockV2;
            const children = side === 'left'
              ? [{ ...newBlock, width: '1/2' as FractionalWidth }, { ...existingBlock, width: '1/2' as FractionalWidth }]
              : [{ ...existingBlock, width: '1/2' as FractionalWidth }, { ...newBlock, width: '1/2' as FractionalWidth }];
            const newRow: LayoutRowV2 = {
              id: nanoid(10),
              type: 'row',
              children,
              gap: 'normal',
            };
            blocks[topIdx] = newRow;
          }
        }
      }

      setLayout(newLayout);
      return;
    }

    // Existing block move
    let movingNode: LayoutNodeV2 | null = null;
    let sourceRowId: string | null = null;
    let sourceChildIdx = -1;

    const topIdx = blocks.findIndex((b) => b.id === activeId);
    if (topIdx !== -1) {
      movingNode = blocks[topIdx];
      blocks.splice(topIdx, 1);
    } else {
      for (let i = 0; i < blocks.length; i++) {
        const node = blocks[i];
        if (isLayoutRowV2(node)) {
          const childIdx = node.children.findIndex((c) => c.id === activeId);
          if (childIdx !== -1) {
            movingNode = node.children[childIdx];
            sourceRowId = node.id;
            sourceChildIdx = childIdx;
            const remaining = node.children.filter((c) => c.id !== activeId);
            if (remaining.length === 0) {
              blocks.splice(i, 1);
            } else if (remaining.length === 1) {
              blocks[i] = remaining[0];
            } else {
              blocks[i] = { ...node, children: remaining };
            }
            break;
          }
        }
      }
    }

    if (!movingNode) return;

    if (targetZone === 'top-level') {
      let adjustedIndex = targetIndex;
      if (topIdx !== -1 && topIdx < targetIndex) adjustedIndex--;
      blocks.splice(Math.min(adjustedIndex, blocks.length), 0, movingNode);
    } else if (targetZone === 'row') {
      const rowId = targetData.rowId as string;
      const rowIdx = blocks.findIndex((b) => b.id === rowId);
      if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx]) && !isLayoutRowV2(movingNode)) {
        const row = blocks[rowIdx] as LayoutRowV2;
        if (row.children.length < 4) {
          const children = [...row.children];
          let adjustedIndex = targetIndex;
          if (sourceRowId === rowId && sourceChildIdx < targetIndex) adjustedIndex--;
          children.splice(Math.min(adjustedIndex, children.length), 0, { ...(movingNode as LayoutBlockV2), width: '1/2' as FractionalWidth });
          blocks[rowIdx] = { ...row, children };
        }
      }
    } else if (targetZone === 'side') {
      const blockId = targetData.blockId as string;
      const side = targetData.side as 'left' | 'right';

      const targetTopIdx = blocks.findIndex((b) => b.id === blockId);
      if (targetTopIdx !== -1 && !isLayoutRowV2(blocks[targetTopIdx]) && !isLayoutRowV2(movingNode)) {
        const existingBlock = blocks[targetTopIdx] as LayoutBlockV2;
        const movingBlock = movingNode as LayoutBlockV2;
        const children = side === 'left'
          ? [{ ...movingBlock, width: '1/2' as FractionalWidth }, { ...existingBlock, width: '1/2' as FractionalWidth }]
          : [{ ...existingBlock, width: '1/2' as FractionalWidth }, { ...movingBlock, width: '1/2' as FractionalWidth }];
        blocks[targetTopIdx] = {
          id: nanoid(10),
          type: 'row',
          children,
          gap: 'normal',
        } as LayoutRowV2;
      }
    }

    setLayout(newLayout);
  }, [layout, setLayout]);

  const handleConfigChange = useCallback((blockId: string, config: BlockConfigV2) => {
    const newLayout = {
      ...layout,
      blocks: layout.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRowV2(node)) return { ...node, config };
        if (isLayoutRowV2(node)) {
          return { ...node, children: node.children.map((c) => c.id === blockId ? { ...c, config } : c) };
        }
        return node;
      }),
    };
    setLayout(newLayout);
  }, [layout, setLayout]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    const newLayout = {
      ...layout,
      blocks: layout.blocks.flatMap((node) => {
        if (node.id === blockId) return [];
        if (isLayoutRowV2(node)) {
          const remaining = node.children.filter((c) => c.id !== blockId);
          if (remaining.length === 0) return [];
          if (remaining.length === 1) return [remaining[0]];
          return [{ ...node, children: remaining }];
        }
        return [node];
      }),
    };
    setLayout(newLayout);
    setConfigBlock(null);
    setSelectedBlockId(null);
  }, [layout, setLayout]);

  const handleCreateField = useCallback((field: { name: string; field_type: string; options: string[]; required: boolean }) => {
    const tempId = `temp-${nanoid(10)}`;
    setPendingFields((prev) => [...prev, { ...field, tempId }]);
    const newLayout = { ...layout, blocks: [...layout.blocks] };
    for (let i = newLayout.blocks.length - 1; i >= 0; i--) {
      const node = newLayout.blocks[i];
      if (!isLayoutRowV2(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
        newLayout.blocks[i] = { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfigV2 };
        setLayout(newLayout);
        return;
      }
    }
  }, [layout, setLayout]);

  const handleQuickAdd = useCallback((type: BlockTypeV2) => {
    const newBlock = createBlock(type);
    setLayout({ ...layout, blocks: [...layout.blocks, newBlock] });
  }, [layout, setLayout]);

  const handleSpacingChange = useCallback((spacing: SpacingPreset) => {
    setLayout({ ...layout, spacing });
  }, [layout, setLayout]);

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    const found = findNode(layout.blocks, blockId);
    if (found && !isLayoutRowV2(found)) {
      setConfigBlock(found as LayoutBlockV2);
    }
  }, [layout.blocks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(layout, pendingFields.map(({ tempId, ...rest }) => rest));
    } finally {
      setSaving(false);
    }
  };

  // --- Rendering ---

  const isDragActive = activeNode !== null;

  const editModeToggle = (
    <div className="flex items-center gap-1 bg-sage-light/50 rounded-lg p-0.5">
      <button
        onClick={() => setIsEditing(false)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          !isEditing ? 'bg-white shadow-sm text-forest-dark' : 'text-sage'
        }`}
      >
        Preview
      </button>
      <button
        onClick={() => setIsEditing(true)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          isEditing ? 'bg-white shadow-sm text-forest-dark' : 'text-sage'
        }`}
      >
        Edit
      </button>
    </div>
  );

  const spacingControl = isEditing ? (
    <div className="flex items-center gap-1">
      {(['compact', 'comfortable', 'spacious'] as SpacingPreset[]).map((s) => (
        <button
          key={s}
          onClick={() => handleSpacingChange(s)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            layout.spacing === s ? 'bg-forest text-white' : 'bg-sage-light/50 text-sage'
          }`}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  ) : null;

  const previewTabBar = (
    <div className="flex gap-1">
      {(['detail', 'form'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setPreviewTab(tab)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${
            previewTab === tab ? 'bg-forest text-white' : 'bg-sage-light text-forest-dark'
          }`}
        >
          {tab === 'detail' ? 'Detail' : 'Form'}
        </button>
      ))}
    </div>
  );

  const previewContent = previewTab === 'detail' ? (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{itemType.icon}</span>
          <h2 className="font-heading font-semibold text-forest-dark text-xl">{mockItem.name}</h2>
        </div>
        {isEditing ? (
          <EditableLayoutRenderer
            layout={layout}
            item={mockItem}
            customFields={allFields}
            selectedBlockId={selectedBlockId}
            isDragActive={isDragActive}
            onSelect={handleSelectBlock}
            onOpenConfig={(blockId) => {
              const found = findNode(layout.blocks, blockId);
              if (found && !isLayoutRowV2(found)) setConfigBlock(found as LayoutBlockV2);
            }}
            onDelete={handleDeleteBlock}
          />
        ) : (
          <LayoutRendererDispatch
            layout={layout}
            item={mockItem}
            mode="preview"
            context="preview"
            customFields={allFields}
          />
        )}
      </div>
    </div>
  ) : (
    <FormPreview layout={layout} customFields={allFields} itemTypeName={itemType.name} />
  );

  const dndWrapped = (content: React.ReactNode) => (
    <DndContext
      sensors={sensors}
      collisionDetection={rowAwareCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {content}
      <DragOverlay>
        {activeNode ? (
          <DragOverlayContent
            node={activeNode}
            customFields={allFields}
            mockItem={mockItem}
            version={2}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  // ---- MOBILE LAYOUT ----
  if (isMobile) {
    return dndWrapped(
      <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
          <button onClick={onCancel} className="text-sm text-forest font-medium">Cancel</button>
          <span className="text-sm font-semibold text-forest-dark">{itemType.name} Layout</span>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-1.5 relative">
            {saving ? 'Saving...' : 'Done'}
            {hasUnsavedChanges && !saving && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
            )}
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-sage-light">
          <div className="flex items-center gap-2">
            {editModeToggle}
            {spacingControl}
          </div>
          {isEditing && (
            <div className="flex items-center gap-1">
              <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded disabled:opacity-30">
                <Undo2 size={16} className="text-forest-dark" />
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded disabled:opacity-30">
                <Redo2 size={16} className="text-forest-dark" />
              </button>
            </div>
          )}
        </div>

        {/* Preview tab bar */}
        <div className="flex items-center justify-center gap-2 px-4 py-2">
          {previewTabBar}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4" onClick={() => setSelectedBlockId(null)}>
          {previewContent}
        </div>

        {/* Mobile component drawer */}
        {isEditing && (
          <ComponentDrawer
            isMobile={true}
            disabledTypes={disabledTypes}
            onQuickAdd={handleQuickAdd}
          />
        )}

        {/* Config drawer */}
        {configBlock && (
          <ConfigDrawer
            block={configBlock}
            customFields={allFields}
            entityTypes={entityTypes}
            onConfigChange={handleConfigChange}
            onDelete={handleDeleteBlock}
            onClose={() => { setConfigBlock(null); setSelectedBlockId(null); }}
            onCreateField={handleCreateField}
          />
        )}
      </div>
    );
  }

  // ---- DESKTOP LAYOUT ----
  return dndWrapped(
    <div className="flex flex-col min-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-forest-dark">{itemType.name} Layout</h3>
        <div className="flex items-center gap-3">
          {isEditing && (
            <div className="flex items-center gap-1">
              <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded hover:bg-sage-light/50 disabled:opacity-30" title="Undo (Ctrl+Z)">
                <Undo2 size={16} className="text-forest-dark" />
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded hover:bg-sage-light/50 disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={16} className="text-forest-dark" />
              </button>
            </div>
          )}
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm relative">
            {saving ? 'Saving...' : 'Save Layout'}
            {hasUnsavedChanges && !saving && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {editModeToggle}
          {spacingControl}
        </div>
        {previewTabBar}
      </div>

      {/* Main content: sidebar + preview */}
      <div className="flex gap-6 flex-1">
        {/* Component sidebar — only in edit mode */}
        {isEditing && (
          <div className="transition-all duration-200">
            <ComponentDrawer
              isMobile={false}
              disabledTypes={disabledTypes}
              onQuickAdd={handleQuickAdd}
            />
          </div>
        )}

        {/* Centered preview card */}
        <div className="flex-1 flex justify-center" onClick={() => setSelectedBlockId(null)}>
          <div className="w-full max-w-[480px]">
            {previewContent}
          </div>
        </div>
      </div>

      {/* Config drawer */}
      {configBlock && (
        <ConfigDrawer
          block={configBlock}
          customFields={allFields}
          entityTypes={entityTypes}
          onConfigChange={handleConfigChange}
          onDelete={handleDeleteBlock}
          onClose={() => { setConfigBlock(null); setSelectedBlockId(null); }}
          onCreateField={handleCreateField}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors from LayoutEditor.tsx

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/LayoutEditor.tsx
git commit -m "feat: add LayoutEditor main orchestrator component"
```

---

## Task 13: Wire LayoutEditor into Admin Page

**Files:**
- Modify: `src/app/admin/properties/[slug]/types/page.tsx`

- [ ] **Step 1: Update the import and usage**

In `src/app/admin/properties/[slug]/types/page.tsx`:

Change the import:
```typescript
import LayoutBuilderV2 from '@/components/layout/builder/LayoutBuilderV2';
```
to:
```typescript
import LayoutEditor from '@/components/layout/builder/LayoutEditor';
```

And change the usage (around line 209):
```typescript
<LayoutBuilderV2
```
to:
```typescript
<LayoutEditor
```

The props are identical (`itemType`, `initialLayout`, `customFields`, `entityTypes`, `onSave`, `onCancel`), so no other changes are needed.

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/app/admin/properties/[slug]/types/page.tsx
git commit -m "feat: wire LayoutEditor into admin types page"
```

---

## Task 14: LayoutEditor Integration Test

**Files:**
- Create: `src/components/layout/builder/__tests__/LayoutEditor.test.tsx`

- [ ] **Step 1: Write integration test**

```typescript
// src/components/layout/builder/__tests__/LayoutEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LayoutEditor from '../LayoutEditor';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('@/lib/permissions/hooks', () => ({
  usePermissions: () => ({ userBaseRole: 'admin' }),
}));

const mockLayout: TypeLayoutV2 = {
  version: 2,
  blocks: [
    { id: 'b1', type: 'status_badge', config: {} },
    { id: 'b2', type: 'divider', config: {} },
  ],
  spacing: 'comfortable',
  peekBlockCount: 3,
};

const defaultProps = {
  itemType: { id: 't1', name: 'Bird', icon: '🐦', color: '#4a7c59', sort_order: 0, layout: mockLayout, created_at: '', org_id: 'o1' },
  initialLayout: mockLayout,
  customFields: [],
  entityTypes: [],
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe('LayoutEditor', () => {
  it('starts in preview mode', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    // Should not show component drawer initially
    expect(screen.queryByText('Field')).not.toBeInTheDocument();
  });

  it('toggles to edit mode', () => {
    render(<LayoutEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Edit'));
    // Component sidebar should now be visible (desktop)
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('shows save button with unsaved indicator', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Save Layout')).toBeInTheDocument();
  });

  it('shows undo/redo buttons in edit mode', () => {
    render(<LayoutEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByTitle(/Undo/)).toBeInTheDocument();
    expect(screen.getByTitle(/Redo/)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel clicked', () => {
    render(<LayoutEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('shows preview tab bar for detail/form', () => {
    render(<LayoutEditor {...defaultProps} />);
    expect(screen.getByText('Detail')).toBeInTheDocument();
    expect(screen.getByText('Form')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npx vitest run src/components/layout/builder/__tests__/LayoutEditor.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add src/components/layout/builder/__tests__/LayoutEditor.test.tsx
git commit -m "test: add LayoutEditor integration tests"
```

---

## Task 15: Run Full Test Suite & Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npm run type-check`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npm run test`
Expected: All tests pass

- [ ] **Step 3: Fix any failures**

If any existing tests break due to the changes (e.g., collision tests needing updates for the new zone type), fix them.

- [ ] **Step 4: Commit any fixes**

```bash
cd /Users/patrick/birdhousemapper-dnd-preview
git add -A
git commit -m "fix: resolve test and type check issues"
```

---

## Task 16: Manual Smoke Test Verification

**Files:** None (manual verification)

- [ ] **Step 1: Start dev server**

Run: `cd /Users/patrick/birdhousemapper-dnd-preview && npm run dev`

- [ ] **Step 2: Verify these scenarios**

Navigate to admin types page. For each item type:

1. **View mode:** Preview renders identically to production (no edit affordances)
2. **Edit toggle:** Click "Edit" — component sidebar appears (desktop), blocks get hover outlines
3. **Drag from sidebar:** Drag a "Field" chip into the preview — drop zone placeholder animates, block appears on drop
4. **Auto-row creation:** Drag a chip to the side edge of an existing block — row forms with 50/50 split
5. **Rearrange:** Drag an existing block to a new position — layout reflows smoothly
6. **Config drawer:** Click a block — config drawer opens from bottom with correct config fields
7. **Undo/redo:** Make changes, Cmd+Z undoes, Cmd+Shift+Z redoes
8. **Save:** Click Save — layout persists, reload shows saved layout
9. **Mobile (resize to <768px):** FAB appears, tap opens drawer, tap-to-add works

- [ ] **Step 3: Note and fix any issues found**

Fix issues and commit.
