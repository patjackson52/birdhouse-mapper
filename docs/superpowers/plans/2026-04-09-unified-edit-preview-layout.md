# Unified Edit/Preview Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Layout Builder's edit and preview modes visually identical — both render the detail preview layout, with edit mode adding block selection/highlighting and preview mode making fields interactive.

**Architecture:** Extend `LayoutRenderer` with an `'edit'` mode that wraps each block in a clickable, highlightable container. `LayoutBuilder` replaces its split detail/form preview with a single unified panel that toggles between `edit` and `preview` modes. `BlockList` gains scroll-to-selection sync with the right panel.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

### Task 1: Extend LayoutRenderer with edit mode and block selection

**Files:**
- Modify: `src/components/layout/LayoutRenderer.tsx`

- [ ] **Step 1: Write failing tests for edit mode**

Add to `src/components/layout/__tests__/LayoutRenderer.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';

// Add these tests inside the existing describe('LayoutRenderer') block:

it('wraps blocks in clickable containers in edit mode', () => {
  const onBlockSelect = vi.fn();
  const layout = makeLayout([
    makeBlock('status_badge', 'b1'),
    makeBlock('text_label', 'b2'),
  ]);

  render(
    <LayoutRenderer
      layout={layout}
      item={baseItem}
      mode="edit"
      context="preview"
      customFields={[]}
      onBlockSelect={onBlockSelect}
    />
  );

  const wrappers = screen.getAllByTestId(/^edit-block-/);
  expect(wrappers).toHaveLength(2);
  expect(wrappers[0].dataset.testid).toBe('edit-block-b1');
  expect(wrappers[1].dataset.testid).toBe('edit-block-b2');
});

it('calls onBlockSelect when a block is clicked in edit mode', async () => {
  const user = userEvent.setup();
  const onBlockSelect = vi.fn();
  const layout = makeLayout([makeBlock('status_badge', 'b1')]);

  render(
    <LayoutRenderer
      layout={layout}
      item={baseItem}
      mode="edit"
      context="preview"
      customFields={[]}
      onBlockSelect={onBlockSelect}
    />
  );

  await user.click(screen.getByTestId('edit-block-b1'));
  expect(onBlockSelect).toHaveBeenCalledWith('b1');
});

it('calls onBlockSelect(null) when clicking the already-selected block', async () => {
  const user = userEvent.setup();
  const onBlockSelect = vi.fn();
  const layout = makeLayout([makeBlock('status_badge', 'b1')]);

  render(
    <LayoutRenderer
      layout={layout}
      item={baseItem}
      mode="edit"
      context="preview"
      customFields={[]}
      selectedBlockId="b1"
      onBlockSelect={onBlockSelect}
    />
  );

  await user.click(screen.getByTestId('edit-block-b1'));
  expect(onBlockSelect).toHaveBeenCalledWith(null);
});

it('applies highlight ring to the selected block', () => {
  const layout = makeLayout([
    makeBlock('status_badge', 'b1'),
    makeBlock('text_label', 'b2'),
  ]);

  render(
    <LayoutRenderer
      layout={layout}
      item={baseItem}
      mode="edit"
      context="preview"
      customFields={[]}
      selectedBlockId="b1"
      onBlockSelect={vi.fn()}
    />
  );

  const selected = screen.getByTestId('edit-block-b1');
  expect(selected.className).toContain('ring-2');

  const unselected = screen.getByTestId('edit-block-b2');
  expect(unselected.className).not.toContain('ring-2');
});

it('does not wrap blocks in clickable containers in preview mode', () => {
  const layout = makeLayout([makeBlock('status_badge', 'b1')]);

  render(
    <LayoutRenderer
      layout={layout}
      item={baseItem}
      mode="preview"
      context="preview"
      customFields={[]}
    />
  );

  expect(screen.queryByTestId('edit-block-b1')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm test -- --run src/components/layout/__tests__/LayoutRenderer.test.tsx`

Expected: FAIL — `mode="edit"` is not a valid value, `onBlockSelect`/`selectedBlockId` props don't exist.

- [ ] **Step 3: Update LayoutRendererProps and renderBlock**

In `src/components/layout/LayoutRenderer.tsx`, update the interface and rendering logic:

```tsx
export interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview' | 'edit';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  selectedBlockId?: string;
  onBlockSelect?: (blockId: string | null) => void;
}
```

Update the `renderBlock` function to wrap blocks in edit mode. Replace the existing `renderBlock` function:

```tsx
function renderBlock(
  node: LayoutNode,
  index: number,
  props: LayoutRendererProps
): React.ReactNode {
  const { item, mode, context, customFields, selectedBlockId, onBlockSelect } = props;

  if (isLayoutRow(node)) {
    const children = node.children.map((child, childIndex) =>
      renderBlock(child, childIndex, props)
    );
    const rowContent = (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlock row={node}>{children as React.ReactNode[]}</RowBlock>
      </BlockErrorBoundary>
    );

    if (mode === 'edit') {
      const isSelected = selectedBlockId === node.id;
      return (
        <div
          key={node.id}
          data-testid={`edit-block-${node.id}`}
          className={`cursor-pointer rounded transition-all ${
            isSelected ? 'ring-2 ring-forest/40' : 'hover:ring-1 hover:ring-sage-light'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onBlockSelect?.(isSelected ? null : node.id);
          }}
        >
          {rowContent}
        </div>
      );
    }

    return rowContent;
  }

  const block = node as LayoutBlock;

  if (block.hideWhenEmpty) {
    if (block.type === 'field_display') {
      const config = block.config as import('@/lib/layout/types').FieldDisplayConfig;
      const value = item.custom_field_values[config.fieldId];
      if (value === null || value === undefined) return null;
    }
  }

  const rendered = renderBlockContent(block, index, props);
  if (rendered === null) return null;

  const blockContent = (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );

  if (mode === 'edit') {
    const isSelected = selectedBlockId === block.id;
    return (
      <div
        key={block.id}
        data-testid={`edit-block-${block.id}`}
        className={`cursor-pointer rounded transition-all ${
          isSelected ? 'ring-2 ring-forest/40' : 'hover:ring-1 hover:ring-sage-light'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onBlockSelect?.(isSelected ? null : block.id);
        }}
      >
        {blockContent}
      </div>
    );
  }

  return blockContent;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm test -- --run src/components/layout/__tests__/LayoutRenderer.test.tsx`

Expected: All tests PASS (both new and existing).

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhousemapper-item-editor-improvements
git add src/components/layout/LayoutRenderer.tsx src/components/layout/__tests__/LayoutRenderer.test.tsx
git commit -m "feat: add edit mode with block selection to LayoutRenderer"
```

---

### Task 2: Add scroll-to-selection to BlockList

**Files:**
- Modify: `src/components/layout/builder/BlockList.tsx`
- Modify: `src/components/layout/builder/BlockListItem.tsx`

- [ ] **Step 1: Add ref forwarding to BlockListItem**

Update `src/components/layout/builder/BlockListItem.tsx` to accept and merge an external ref. The component already uses `useSortable`'s `setNodeRef`, so we need to merge refs:

```tsx
// At the top of the file, add forwardRef import:
import { useState, forwardRef, useCallback } from 'react';

// Change the component to use forwardRef. Replace the entire export default function:
const BlockListItem = forwardRef<HTMLDivElement, Props>(function BlockListItem(
  {
    block,
    customFields,
    entityTypes,
    fieldName,
    onConfigChange,
    onDelete,
    onCreateField,
    isExpanded,
    onToggleExpand,
  },
  externalRef
) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  // Merge sortable ref with external ref
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setSortableRef(node);
      if (typeof externalRef === 'function') {
        externalRef(node);
      } else if (externalRef) {
        externalRef.current = node;
      }
    },
    [setSortableRef, externalRef]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const label = block.type === 'field_display' && fieldName
    ? fieldName
    : BLOCK_LABELS[block.type] ?? block.type;

  return (
    <div ref={mergedRef} style={style} className="border border-sage-light rounded-lg bg-white">
      {/* Header row */}
      <div className="flex items-center min-h-[48px]">
        <button
          {...attributes}
          {...listeners}
          className="p-3 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-sage" />
        </button>
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 py-2 text-left"
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
            <button onClick={() => onDelete(block.id)} className="text-xs text-red-600 font-medium px-2 py-1">
              Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-sage px-2 py-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-3 text-sage hover:text-red-500 transition-colors"
            aria-label="Delete block"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Config panel (accordion) */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-sage-light/50">
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
});

export default BlockListItem;
```

- [ ] **Step 2: Update BlockList to accept selectedBlockId and sync**

Update `src/components/layout/builder/BlockList.tsx`. Add new props and scroll-to-selection logic:

```tsx
// Add to imports:
import { useState, useEffect, useRef, createRef } from 'react';

// Update the Props interface — add these two fields:
interface Props {
  nodes: LayoutNode[];
  customFields: CustomField[];
  entityTypes: EntityType[];
  peekBlockCount: number;
  selectedBlockId: string | null;
  onBlockSelect: (blockId: string | null) => void;
  onReorder: (activeId: string, overId: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onPeekCountChange: (count: number) => void;
  onRowChange: (rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => void;
  onAddToRow: (rowId: string, blockType: string) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
}
```

Update the component function signature to destructure the new props:

```tsx
export default function BlockList({
  nodes,
  customFields,
  entityTypes,
  peekBlockCount,
  selectedBlockId,
  onBlockSelect,
  onReorder,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onPeekCountChange,
  onRowChange,
  onAddToRow,
  onRemoveFromRow,
}: Props) {
```

Replace the `expandedId` state with synced logic. Remove:

```tsx
const [expandedId, setExpandedId] = useState<string | null>(null);
```

Replace with:

```tsx
// Sync expandedId to selectedBlockId from the right panel
const expandedId = selectedBlockId;

const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

// Scroll to selected block when selection changes
useEffect(() => {
  if (selectedBlockId) {
    const el = blockRefs.current.get(selectedBlockId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}, [selectedBlockId]);
```

Update the `BlockListItem` usage to pass a ref callback and sync selection. Replace the `BlockListItem` render:

```tsx
<BlockListItem
  ref={(el: HTMLDivElement | null) => {
    if (el) blockRefs.current.set(node.id, el);
    else blockRefs.current.delete(node.id);
  }}
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
  onToggleExpand={() => onBlockSelect(expandedId === node.id ? null : node.id)}
/>
```

Update the `RowEditor` `onToggleExpand` similarly:

```tsx
onToggleExpand={(id) => onBlockSelect(expandedId === id ? null : id)}
```

- [ ] **Step 3: Run tests to verify nothing is broken**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm test -- --run`

Expected: All existing tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhousemapper-item-editor-improvements
git add src/components/layout/builder/BlockList.tsx src/components/layout/builder/BlockListItem.tsx
git commit -m "feat: add ref forwarding to BlockListItem and scroll-to-selection in BlockList"
```

---

### Task 3: Update LayoutBuilder to use unified edit/preview panel

**Files:**
- Modify: `src/components/layout/builder/LayoutBuilder.tsx`

- [ ] **Step 1: Add selectedBlockId and rightPanelMode state**

In `LayoutBuilder`, replace the existing preview state. Remove these lines:

```tsx
const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');
```

And the `PreviewTab` type:

```tsx
type PreviewTab = 'detail' | 'form';
```

Replace with:

```tsx
const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
const [rightPanelMode, setRightPanelMode] = useState<'edit' | 'preview'>('edit');
const [activeTab, setActiveTab] = useState<'build' | 'edit' | 'preview'>('build');
```

Add a handler to clear selection when switching to preview:

```tsx
const handleRightPanelModeChange = useCallback((mode: 'edit' | 'preview') => {
  setRightPanelMode(mode);
  if (mode === 'preview') {
    setSelectedBlockId(null);
  }
}, []);
```

- [ ] **Step 2: Replace the right panel content**

Remove the `detailPreview` and `formPreviewContent` variables (lines 232-252). Remove the `FormPreview` import.

Replace with a single `unifiedPreview` variable:

```tsx
const unifiedPreview = (
  <div className="bg-gray-100 rounded-xl p-3">
    <div className="bg-white rounded-t-2xl shadow-lg">
      {/* Handle */}
      <div className="flex justify-center py-3">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      <div className="px-4 pb-4 max-h-[70vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{itemType.icon}</span>
          <h2 className="font-heading font-semibold text-forest-dark text-xl">
            {mockItem.name}
          </h2>
        </div>

        {/* Layout content */}
        <LayoutRenderer
          layout={layout}
          item={mockItem}
          mode={rightPanelMode}
          context="preview"
          customFields={allFields}
          selectedBlockId={selectedBlockId}
          onBlockSelect={setSelectedBlockId}
        />
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Update the desktop layout**

Replace the desktop return block (the `return` starting around line 297). Replace the right panel section:

```tsx
{/* Preview panel */}
<div className="flex-[2] overflow-y-auto">
  <div className="flex gap-1 mb-3">
    {(['edit', 'preview'] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => handleRightPanelModeChange(tab)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium ${
          rightPanelMode === tab ? 'bg-forest text-white' : 'bg-sage-light text-forest-dark'
        }`}
      >
        {tab === 'edit' ? 'Edit' : 'Preview'}
      </button>
    ))}
  </div>
  {unifiedPreview}
</div>
```

- [ ] **Step 4: Update the mobile layout**

Replace the mobile tabs from `['build', 'detail', 'form']` to `['build', 'edit', 'preview']`:

```tsx
{/* Tab toggle */}
<div className="flex border-b border-sage-light">
  {(['build', 'edit', 'preview'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => {
        setActiveTab(tab);
        if (tab === 'edit') setRightPanelMode('edit');
        if (tab === 'preview') {
          setRightPanelMode('preview');
          setSelectedBlockId(null);
        }
      }}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'text-forest border-b-2 border-forest'
          : 'text-sage'
      }`}
    >
      {tab === 'build' ? 'Build' : tab === 'edit' ? 'Edit' : 'Preview'}
    </button>
  ))}
</div>

{/* Tab content */}
<div className="flex-1 overflow-y-auto p-4">
  {activeTab === 'build' && buildContent}
  {(activeTab === 'edit' || activeTab === 'preview') && unifiedPreview}
</div>
```

- [ ] **Step 5: Pass selectedBlockId and onBlockSelect to BlockList**

In the `buildContent` variable, update the `BlockList` usage to pass the new props:

```tsx
<BlockList
  nodes={layout.blocks}
  customFields={allFields}
  entityTypes={entityTypes}
  peekBlockCount={layout.peekBlockCount}
  selectedBlockId={selectedBlockId}
  onBlockSelect={setSelectedBlockId}
  onReorder={handleReorder}
  onConfigChange={handleConfigChange}
  onDeleteBlock={handleDeleteBlock}
  onCreateField={handleCreateField}
  onPeekCountChange={handlePeekCountChange}
  onRowChange={handleRowChange}
  onAddToRow={handleAddToRow}
  onRemoveFromRow={handleRemoveFromRow}
/>
```

- [ ] **Step 6: Add mobile edit-mode tap → switch to Build tab**

Add a handler that wraps `setSelectedBlockId` on mobile to also switch tabs:

```tsx
const handleBlockSelectFromPreview = useCallback((blockId: string | null) => {
  setSelectedBlockId(blockId);
  if (isMobile && blockId) {
    setActiveTab('build');
  }
}, [isMobile]);
```

In the `unifiedPreview`, replace `onBlockSelect={setSelectedBlockId}` with `onBlockSelect={handleBlockSelectFromPreview}`.

- [ ] **Step 7: Remove unused FormPreview import**

Remove from the top of `LayoutBuilder.tsx`:

```tsx
import FormPreview from '../preview/FormPreview';
```

- [ ] **Step 8: Run type-check and tests**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm run type-check && npm test -- --run`

Expected: No type errors, all tests PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/patrick/birdhousemapper-item-editor-improvements
git add src/components/layout/builder/LayoutBuilder.tsx
git commit -m "feat: replace split detail/form preview with unified edit/preview panel"
```

---

### Task 4: Manual verification and cleanup

**Files:**
- Possibly modify: `src/components/layout/builder/LayoutBuilder.tsx` (if issues found)

- [ ] **Step 1: Run the dev server**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm run dev`

- [ ] **Step 2: Verify desktop behavior**

Navigate to an item type's layout builder. Verify:
1. Right panel shows Edit/Preview toggle (not Detail/Form)
2. Both Edit and Preview modes show the same detail preview layout (gray bg, white card, handle, icon + title)
3. In Edit mode, clicking a block highlights it with a ring
4. Clicking a highlighted block deselects it
5. When a block is selected on the right, its config expands and scrolls into view on the left
6. Clicking a block in the left BlockList highlights it on the right
7. Switching to Preview mode clears selection and dismisses any highlight
8. In Preview mode, the layout looks identical to Edit mode (no visible change except highlight gone)

- [ ] **Step 3: Verify mobile behavior**

Resize browser to mobile width. Verify:
1. Three tabs: Build, Edit, Preview
2. Edit tab shows the unified layout
3. Tapping a block in Edit mode switches to Build tab with that block expanded
4. Preview tab shows same layout, no selection, fields interactive

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/patrick/birdhousemapper-item-editor-improvements && npm test -- --run`

Expected: All tests PASS.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
cd /Users/patrick/birdhousemapper-item-editor-improvements
git add -u
git commit -m "fix: address issues found during manual verification"
```
