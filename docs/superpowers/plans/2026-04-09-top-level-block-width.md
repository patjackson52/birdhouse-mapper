# Top-Level Block Width & Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to set fractional width and horizontal alignment on any layout block, not just blocks inside rows.

**Architecture:** Add `align` field to `LayoutBlockV2`, expose the existing `WidthPicker` for all blocks (remove `isInRow` gate), create `AlignPicker` component, and update both renderers (live + editor preview) to apply `max-width` + flexbox alignment on width-constrained top-level blocks. Wire the ConfigDrawer to use `BlockConfigPanelV2` (which has width/permissions) instead of the V1 `BlockConfigPanel`.

**Tech Stack:** TypeScript, React, Zod, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-09-top-level-block-width-design.md`

---

### Task 1: Add `BlockAlign` type and `align` field to data model

**Files:**
- Modify: `src/lib/layout/types-v2.ts:19` (after `FractionalWidth`)
- Modify: `src/lib/layout/types-v2.ts:54-61` (`LayoutBlockV2` interface)

- [ ] **Step 1: Write the failing test**

Create test file:

```tsx
// src/lib/layout/__tests__/types-v2.test.ts
import { describe, it, expect } from 'vitest';
import type { LayoutBlockV2, BlockAlign } from '../types-v2';

describe('types-v2 BlockAlign', () => {
  it('accepts align property on LayoutBlockV2', () => {
    const block: LayoutBlockV2 = {
      id: 'test-1',
      type: 'status_badge',
      config: {},
      width: '1/2',
      align: 'center',
    };
    expect(block.align).toBe('center');
  });

  it('allows align to be undefined', () => {
    const block: LayoutBlockV2 = {
      id: 'test-2',
      type: 'status_badge',
      config: {},
    };
    expect(block.align).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/lib/layout/__tests__/types-v2.test.ts`

Expected: FAIL — `BlockAlign` is not exported from `types-v2`.

- [ ] **Step 3: Add `BlockAlign` type and `align` field**

In `src/lib/layout/types-v2.ts`, after line 19 (`FractionalWidth`), add:

```ts
export type BlockAlign = 'start' | 'center' | 'end';
```

In the `LayoutBlockV2` interface, add `align` after `width`:

```ts
export interface LayoutBlockV2 {
  id: string;
  type: BlockTypeV2;
  config: BlockConfigV2;
  width?: FractionalWidth;
  align?: BlockAlign;           // NEW
  hideWhenEmpty?: boolean;
  permissions?: BlockPermissions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/lib/layout/__tests__/types-v2.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/types-v2.ts src/lib/layout/__tests__/types-v2.test.ts
git commit -m "feat: add BlockAlign type and align field to LayoutBlockV2"
```

---

### Task 2: Add `align` to Zod schema

**Files:**
- Modify: `src/lib/layout/schemas-v2.ts:48-52` (`v2CommonFields`)

- [ ] **Step 1: Write the failing test**

Create test file:

```tsx
// src/lib/layout/__tests__/schemas-v2-align.test.ts
import { describe, it, expect } from 'vitest';
import { layoutBlockV2Schema } from '../schemas-v2';

describe('schemas-v2 align validation', () => {
  const validBlock = {
    id: 'b1',
    type: 'status_badge',
    config: {},
  };

  it('accepts block without align', () => {
    const result = layoutBlockV2Schema.safeParse(validBlock);
    expect(result.success).toBe(true);
  });

  it('accepts block with valid align values', () => {
    for (const align of ['start', 'center', 'end']) {
      const result = layoutBlockV2Schema.safeParse({ ...validBlock, align });
      expect(result.success).toBe(true);
    }
  });

  it('rejects block with invalid align value', () => {
    const result = layoutBlockV2Schema.safeParse({ ...validBlock, align: 'middle' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/lib/layout/__tests__/schemas-v2-align.test.ts`

Expected: FAIL — `align: 'start'` causes validation error because it's not in the schema (Zod strips unknown keys in strict mode, or the discriminated union rejects the extra field).

- [ ] **Step 3: Add `align` to v2CommonFields**

In `src/lib/layout/schemas-v2.ts`, update `v2CommonFields` (line 48):

```ts
const v2CommonFields = {
  width: fractionalWidthSchema.optional(),
  align: z.enum(['start', 'center', 'end']).optional(),
  hideWhenEmpty: z.boolean().optional(),
  permissions: blockPermissionsSchema.optional(),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/lib/layout/__tests__/schemas-v2-align.test.ts`

Expected: PASS

- [ ] **Step 5: Run all existing schema tests to ensure no regressions**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/lib/layout/`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/layout/schemas-v2.ts src/lib/layout/__tests__/schemas-v2-align.test.ts
git commit -m "feat: add align field to V2 block Zod schema"
```

---

### Task 3: Create `AlignPicker` component

**Files:**
- Create: `src/components/layout/builder/AlignPicker.tsx`
- Create: `src/components/layout/builder/__tests__/AlignPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/builder/__tests__/AlignPicker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AlignPicker from '../AlignPicker';

describe('AlignPicker', () => {
  it('renders three alignment buttons', () => {
    render(<AlignPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /left/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /center/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /right/i })).toBeDefined();
  });

  it('highlights the active alignment', () => {
    render(<AlignPicker value="center" onChange={vi.fn()} />);
    const centerBtn = screen.getByRole('button', { name: /center/i });
    expect(centerBtn.className).toContain('bg-forest');
  });

  it('defaults visual highlight to start when value is undefined', () => {
    render(<AlignPicker value={undefined} onChange={vi.fn()} />);
    const leftBtn = screen.getByRole('button', { name: /left/i });
    expect(leftBtn.className).toContain('bg-forest');
  });

  it('calls onChange with the selected alignment', () => {
    const onChange = vi.fn();
    render(<AlignPicker value="start" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /right/i }));
    expect(onChange).toHaveBeenCalledWith('end');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/AlignPicker.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AlignPicker`**

```tsx
// src/components/layout/builder/AlignPicker.tsx
'use client';

import type { BlockAlign } from '@/lib/layout/types-v2';

interface Props {
  value: BlockAlign | undefined;
  onChange: (align: BlockAlign) => void;
}

const OPTIONS: { value: BlockAlign; label: string }[] = [
  { value: 'start', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'Right' },
];

export default function AlignPicker({ value, onChange }: Props) {
  const active = value ?? 'start';

  return (
    <div>
      <label className="label">Align</label>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === opt.value ? 'bg-forest text-white' : 'bg-white border border-sage-light'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/AlignPicker.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/AlignPicker.tsx src/components/layout/builder/__tests__/AlignPicker.test.tsx
git commit -m "feat: add AlignPicker component for block alignment selection"
```

---

### Task 4: Add `'full'` option to `WidthPicker`

**Files:**
- Modify: `src/components/layout/builder/WidthPicker.tsx:10-16` (OPTIONS array)

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/builder/__tests__/WidthPicker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WidthPicker from '../WidthPicker';

describe('WidthPicker', () => {
  it('renders Full option', () => {
    render(<WidthPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText('Full')).toBeDefined();
  });

  it('highlights full when selected', () => {
    render(<WidthPicker value="full" onChange={vi.fn()} />);
    const fullBtn = screen.getByText('Full');
    expect(fullBtn.className).toContain('bg-forest');
  });

  it('calls onChange with full', () => {
    const onChange = vi.fn();
    render(<WidthPicker value="1/2" onChange={onChange} />);
    fireEvent.click(screen.getByText('Full'));
    expect(onChange).toHaveBeenCalledWith('full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/WidthPicker.test.tsx`

Expected: FAIL — no "Full" button rendered.

- [ ] **Step 3: Add `'full'` to the OPTIONS array**

In `src/components/layout/builder/WidthPicker.tsx`, update the OPTIONS array:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/WidthPicker.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/builder/WidthPicker.tsx src/components/layout/builder/__tests__/WidthPicker.test.tsx
git commit -m "feat: add Full option to WidthPicker for resetting to full width"
```

---

### Task 5: Wire `ConfigDrawer` to use `BlockConfigPanelV2` with width and align

**Files:**
- Modify: `src/components/layout/builder/ConfigDrawer.tsx:7-8` (import), `9-17` (props), `33-42` (destructure), `143-149` (panel render)
- Modify: `src/components/layout/builder/BlockConfigPanelV2.tsx:26-31` (props interface), `284-299` (render)

The ConfigDrawer currently uses the V1 `BlockConfigPanel` which has no width/permissions support. We need to:
1. Switch to `BlockConfigPanelV2`
2. Add `onWidthChange` and `onAlignChange` props to ConfigDrawer
3. Remove the `isInRow` gate in `BlockConfigPanelV2` and add align support

- [ ] **Step 1: Update `BlockConfigPanelV2` — remove `isInRow`, add align**

In `src/components/layout/builder/BlockConfigPanelV2.tsx`:

Update imports (add `BlockAlign`):

```ts
import type {
  LayoutBlockV2,
  BlockConfigV2,
  FractionalWidth,
  BlockPermissions,
  BlockAlign,
  DescriptionConfig,
} from '@/lib/layout/types-v2';
```

Update the `Props` interface — remove `isInRow`, make `onWidthChange` required, add `onAlignChange`:

```ts
interface Props {
  block: LayoutBlockV2;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onWidthChange: (blockId: string, width: FractionalWidth) => void;
  onAlignChange: (blockId: string, align: BlockAlign) => void;
  onPermissionsChange: (blockId: string, permissions: BlockPermissions | undefined) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
}
```

Update the destructure to match:

```ts
export default function BlockConfigPanelV2({
  block,
  customFields,
  entityTypes,
  onConfigChange,
  onWidthChange,
  onAlignChange,
  onPermissionsChange,
  onCreateField,
}: Props) {
```

Add import for `AlignPicker`:

```ts
import AlignPicker from './AlignPicker';
```

Replace the return section (lines 284-299) with:

```tsx
  return (
    <div>
      {renderConfig()}
      <div className="border-t border-sage-light/50 pt-2 mt-3">
        <WidthPicker
          value={block.width}
          onChange={(width) => onWidthChange(block.id, width)}
        />
      </div>
      {block.width && block.width !== 'full' && (
        <div className="pt-2">
          <AlignPicker
            value={block.align}
            onChange={(align) => onAlignChange(block.id, align)}
          />
        </div>
      )}
      <PermissionsConfig
        value={block.permissions}
        onChange={(permissions) => onPermissionsChange(block.id, permissions)}
      />
    </div>
  );
```

- [ ] **Step 2: Update `ConfigDrawer` — switch to `BlockConfigPanelV2`, add new props**

In `src/components/layout/builder/ConfigDrawer.tsx`:

Update import (line 7):

```ts
import BlockConfigPanelV2 from './BlockConfigPanelV2';
```

Update the `ConfigDrawerProps` interface to add new callback props:

```ts
interface ConfigDrawerProps {
  block: LayoutBlockV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onConfigChange: (blockId: string, config: BlockConfigV2) => void;
  onWidthChange: (blockId: string, width: import('@/lib/layout/types-v2').FractionalWidth) => void;
  onAlignChange: (blockId: string, align: import('@/lib/layout/types-v2').BlockAlign) => void;
  onPermissionsChange: (blockId: string, permissions: import('@/lib/layout/types-v2').BlockPermissions | undefined) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  isMobile?: boolean;
}
```

Update destructure to include new props:

```ts
export default function ConfigDrawer({
  block,
  customFields,
  entityTypes,
  onConfigChange,
  onWidthChange,
  onAlignChange,
  onPermissionsChange,
  onDelete,
  onClose,
  onCreateField,
  isMobile = false,
}: ConfigDrawerProps) {
```

Replace the `<BlockConfigPanel>` usage (line 143-148) with:

```tsx
<BlockConfigPanelV2
  block={block}
  customFields={customFields}
  entityTypes={entityTypes}
  onConfigChange={onConfigChange}
  onWidthChange={onWidthChange}
  onAlignChange={onAlignChange}
  onPermissionsChange={onPermissionsChange}
  onCreateField={onCreateField}
/>
```

- [ ] **Step 3: Update `LayoutEditor.tsx` — add `handleAlignChange`, pass new props to ConfigDrawer**

In `src/components/layout/builder/LayoutEditor.tsx`:

Add import for `BlockAlign`:

```ts
import type {
  // ... existing imports ...
  BlockAlign,
} from '@/lib/layout/types-v2';
```

Update `handleWidthChange` (line 551-566) to also handle top-level blocks:

```ts
const handleWidthChange = useCallback((blockId: string, width: FractionalWidth) => {
  update({
    ...layout,
    blocks: layout.blocks.map((node) => {
      if (node.id === blockId && !isLayoutRowV2(node)) {
        return { ...node, width: width === 'full' ? undefined : width };
      }
      if (isLayoutRowV2(node)) {
        return {
          ...node,
          children: node.children.map((child) =>
            child.id === blockId ? { ...child, width } : child,
          ),
        };
      }
      return node;
    }),
  });
}, [layout, update]);
```

Add `handleAlignChange` right after `handleWidthChange`:

```ts
const handleAlignChange = useCallback((blockId: string, align: BlockAlign) => {
  update({
    ...layout,
    blocks: layout.blocks.map((node) => {
      if (node.id === blockId && !isLayoutRowV2(node)) {
        return { ...node, align: align === 'start' ? undefined : align };
      }
      if (isLayoutRowV2(node)) {
        return {
          ...node,
          children: node.children.map((child) =>
            child.id === blockId ? { ...child, align: align === 'start' ? undefined : align } : child,
          ),
        };
      }
      return node;
    }),
  });
}, [layout, update]);
```

Update the `configDrawerProps` object (line 658-666) to include new handlers:

```ts
const configDrawerProps = {
  block: selectedBlock,
  customFields: allFields,
  entityTypes,
  onConfigChange: handleConfigChange,
  onWidthChange: handleWidthChange,
  onAlignChange: handleAlignChange,
  onPermissionsChange: handlePermissionsChange,
  onDelete: handleDeleteBlock,
  onClose: () => setSelectedBlockId(null),
  onCreateField: handleCreateField,
};
```

Also update `handleDrop` — when placing a block at top-level (line 374), stop stripping `width`:

```ts
// Line 374: Remove the width-stripping logic for top-level placement
const node = isLayoutRowV2(movingNode) ? movingNode : (movingNode as LayoutBlockV2);
```

- [ ] **Step 4: Update ConfigDrawer tests**

Update `src/components/layout/builder/__tests__/ConfigDrawer.test.tsx` to pass the new required props:

Add mock for `BlockConfigPanelV2` at the top of the file (before imports):

```ts
vi.mock('../BlockConfigPanelV2', () => ({
  default: (props: any) => (
    <div data-testid="block-config-panel">
      {props.block.type === 'field_display' && <span>Field</span>}
      {props.block.type === 'divider' && <span>No configuration needed</span>}
    </div>
  ),
}));
```

Add new callback mocks:

```ts
const onWidthChange = vi.fn();
const onAlignChange = vi.fn();
const onPermissionsChange = vi.fn();
```

Update all `<ConfigDrawer>` renders in the test to include the new props: `onWidthChange={onWidthChange} onAlignChange={onAlignChange} onPermissionsChange={onPermissionsChange}`

- [ ] **Step 5: Run tests**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/ConfigDrawer.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/builder/BlockConfigPanelV2.tsx src/components/layout/builder/ConfigDrawer.tsx src/components/layout/builder/LayoutEditor.tsx src/components/layout/builder/__tests__/ConfigDrawer.test.tsx
git commit -m "feat: wire width and align controls into ConfigDrawer for all blocks"
```

---

### Task 6: Render width and alignment on top-level blocks in `LayoutRendererV2`

**Files:**
- Modify: `src/components/layout/LayoutRendererV2.tsx:57-103` (`renderBlock` function)
- Modify: `src/components/layout/__tests__/LayoutRendererV2.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/layout/__tests__/LayoutRendererV2.test.tsx`:

```tsx
it('applies max-width to top-level block with width set', () => {
  const layout = makeLayout([
    { ...makeBlock('status_badge', 'b1'), width: '1/2' } as LayoutNodeV2,
  ]);

  const { container } = render(
    <LayoutRendererV2
      layout={layout}
      item={baseItem}
      mode="live"
      context="side-panel"
      customFields={[]}
    />
  );

  const wrapper = container.querySelector('[data-block-width]');
  expect(wrapper).not.toBeNull();
  expect(wrapper!.getAttribute('data-block-width')).toBe('1/2');
  expect((wrapper as HTMLElement).style.maxWidth).toBe('50%');
});

it('applies center alignment to top-level block with align=center', () => {
  const layout = makeLayout([
    { ...makeBlock('status_badge', 'b1'), width: '1/3', align: 'center' } as LayoutNodeV2,
  ]);

  const { container } = render(
    <LayoutRendererV2
      layout={layout}
      item={baseItem}
      mode="live"
      context="side-panel"
      customFields={[]}
    />
  );

  const wrapper = container.querySelector('[data-block-width]');
  expect(wrapper).not.toBeNull();
  expect((wrapper as HTMLElement).style.justifyContent).toBe('center');
});

it('applies end alignment to top-level block with align=end', () => {
  const layout = makeLayout([
    { ...makeBlock('status_badge', 'b1'), width: '1/4', align: 'end' } as LayoutNodeV2,
  ]);

  const { container } = render(
    <LayoutRendererV2
      layout={layout}
      item={baseItem}
      mode="live"
      context="side-panel"
      customFields={[]}
    />
  );

  const wrapper = container.querySelector('[data-block-width]');
  expect((wrapper as HTMLElement).style.justifyContent).toBe('flex-end');
});

it('does not apply width wrapper when width is full', () => {
  const layout = makeLayout([
    { ...makeBlock('status_badge', 'b1'), width: 'full' } as LayoutNodeV2,
  ]);

  const { container } = render(
    <LayoutRendererV2
      layout={layout}
      item={baseItem}
      mode="live"
      context="side-panel"
      customFields={[]}
    />
  );

  expect(container.querySelector('[data-block-width]')).toBeNull();
});

it('does not apply width wrapper to blocks inside rows', () => {
  const layout = makeLayout([
    {
      id: 'row-1',
      type: 'row',
      gap: 'normal',
      children: [
        { ...makeBlock('status_badge', 'b1'), width: '1/2' } as any,
        makeBlock('divider', 'b2') as any,
      ],
    },
  ]);

  const { container } = render(
    <LayoutRendererV2
      layout={layout}
      item={baseItem}
      mode="live"
      context="side-panel"
      customFields={[]}
    />
  );

  expect(container.querySelector('[data-block-width]')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/__tests__/LayoutRendererV2.test.tsx`

Expected: FAIL — no `data-block-width` wrapper rendered.

- [ ] **Step 3: Update `LayoutRendererV2` to wrap width-constrained top-level blocks**

In `src/components/layout/LayoutRendererV2.tsx`:

Add import for `BlockAlign`:

```ts
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, BlockPermissions, BlockAlign } from '@/lib/layout/types-v2';
```

Add the width-to-CSS map (can import from a shared location or define inline):

```ts
const WIDTH_TO_CSS: Record<string, string> = {
  '1/4': '25%',
  '1/3': '33.333%',
  '1/2': '50%',
  '2/3': '66.667%',
  '3/4': '75%',
};

const ALIGN_TO_JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};
```

Update the `renderBlock` function to accept an `isTopLevel` parameter. In the main component, pass `true` for top-level blocks. When `isTopLevel && block.width && block.width !== 'full'`, wrap the rendered block in an alignment div:

Replace the `renderBlock` function signature and add wrapping logic. After the existing `return` statement (line 98-102) for non-row blocks, wrap the result:

```tsx
function renderBlock(
  node: LayoutNodeV2,
  index: number,
  props: LayoutRendererV2Props,
  userBaseRole: string,
  isTopLevel = false,
): React.ReactNode {
  const { item, mode, context, customFields } = props;

  if (!hasAccess(userBaseRole, node.permissions)) {
    return null;
  }

  if (isLayoutRowV2(node)) {
    const children = node.children.map((child, childIndex) =>
      renderBlock(child, childIndex, props, userBaseRole, false)
    );
    return (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlockV2 row={node}>{children as React.ReactNode[]}</RowBlockV2>
      </BlockErrorBoundary>
    );
  }

  const block = node as LayoutBlockV2;

  if (block.hideWhenEmpty) {
    if (block.type === 'field_display') {
      const config = block.config as import('@/lib/layout/types').FieldDisplayConfig;
      const value = item.custom_field_values[config.fieldId];
      if (value === null || value === undefined) return null;
    }
    if (block.type === 'description') {
      if (!item.description) return null;
    }
  }

  const rendered = renderBlockContent(block, index, props);
  if (rendered === null) return null;

  let content = (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );

  // Wrap top-level blocks that have a non-full width
  if (isTopLevel && block.width && block.width !== 'full') {
    const maxWidth = WIDTH_TO_CSS[block.width];
    const justify = ALIGN_TO_JUSTIFY[block.align ?? 'start'];

    content = (
      <div
        key={block.id}
        data-block-width={block.width}
        style={{
          display: 'flex',
          justifyContent: justify,
        }}
      >
        <div style={{ width: '100%', maxWidth }}>
          {content}
        </div>
      </div>
    );
  }

  return content;
}
```

Update the main render to pass `isTopLevel: true`:

```tsx
{nodes.map((node, index) => renderBlock(node, index, props, userBaseRole, true))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/__tests__/LayoutRendererV2.test.tsx`

Expected: All PASS (new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/LayoutRendererV2.tsx src/components/layout/__tests__/LayoutRendererV2.test.tsx
git commit -m "feat: render width and alignment on top-level blocks in LayoutRendererV2"
```

---

### Task 7: Update `EditableLayoutRenderer` to show width in editor preview

**Files:**
- Modify: `src/components/layout/builder/EditableLayoutRenderer.tsx:41-61` (renderEditableBlock), `63-100` (main render)

- [ ] **Step 1: Write the failing test**

Add to `src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`. First read the existing test file to understand the mocking setup, then add:

```tsx
it('wraps top-level block with width in alignment container', () => {
  const layout = makeLayout([
    { id: 'b1', type: 'status_badge', config: {}, width: '1/2' as any },
  ]);

  const { container } = render(
    <EditableLayoutRenderer
      layout={layout}
      item={mockItem}
      customFields={[]}
      selectedBlockId={null}
      isDragActive={false}
      onSelect={vi.fn()}
    />
  );

  const wrapper = container.querySelector('[data-block-width="1/2"]');
  expect(wrapper).not.toBeNull();
  expect((wrapper as HTMLElement).style.maxWidth).toBe('50%');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`

Expected: FAIL — no `data-block-width` wrapper.

- [ ] **Step 3: Update `EditableLayoutRenderer` to apply width constraints**

In `src/components/layout/builder/EditableLayoutRenderer.tsx`:

Add the width/alignment maps at the top (after imports):

```ts
import type { BlockAlign } from '@/lib/layout/types-v2';

const WIDTH_TO_CSS: Record<string, string> = {
  '1/4': '25%',
  '1/3': '33.333%',
  '1/2': '50%',
  '2/3': '66.667%',
  '3/4': '75%',
};

const ALIGN_TO_JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};
```

In the main render section where top-level blocks are rendered (line 86), wrap the `renderEditableBlock` call with width logic:

```tsx
{isLayoutRowV2(node) ? (
  <EditableRow
    row={node}
    rowIndex={index}
    selectedBlockId={selectedBlockId}
    isDragActive={isDragActive}
    onSelect={onSelect}
    renderBlock={renderEditableBlock}
  />
) : (() => {
  const block = node as LayoutBlockV2;
  const editableBlock = renderEditableBlock(block, index, false, 0);

  if (block.width && block.width !== 'full') {
    const maxWidth = WIDTH_TO_CSS[block.width];
    const justify = ALIGN_TO_JUSTIFY[block.align ?? 'start'];
    return (
      <div
        data-block-width={block.width}
        style={{
          display: 'flex',
          justifyContent: justify,
        }}
      >
        <div style={{ width: '100%', maxWidth }}>
          {editableBlock}
        </div>
      </div>
    );
  }
  return editableBlock;
})()}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx`

Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npx vitest run`

Expected: All pass (same baseline failures as before, no new failures).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/builder/EditableLayoutRenderer.tsx src/components/layout/builder/__tests__/EditableLayoutRenderer.test.tsx
git commit -m "feat: show width constraints in layout editor preview"
```

---

### Task 8: Type check and build verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npm run type-check`

Expected: No new errors. If there are errors related to the `isInRow` prop removal or new props, fix them.

- [ ] **Step 2: Run production build**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/layout-enhancements && npm run test`

Expected: Same baseline pass/fail as before (1035 passing, 11 pre-existing failures). No new failures.

- [ ] **Step 4: Fix any issues and commit**

If any issues found, fix and commit with descriptive message.
