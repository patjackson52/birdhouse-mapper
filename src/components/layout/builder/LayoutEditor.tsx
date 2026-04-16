'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Undo2, Redo2 } from 'lucide-react';
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
  BlockAlign,
} from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayoutV2 } from '@/lib/layout/defaults-v2';
import { migrateV1toV2 } from '@/lib/layout/migration';
import { generateMockItem } from '@/lib/layout/mock-data';
import { useLayoutHistory } from '@/hooks/useLayoutHistory';
import ComponentDrawer from './ComponentDrawer';
import SpacingPicker from './SpacingPicker';
import EditableLayoutRenderer from './EditableLayoutRenderer';
import ConfigDrawer from './ConfigDrawer';
import DragOverlayContent from './DragOverlayContent';
import LayoutRendererDispatch from '../LayoutRendererDispatch';
import FormPreview from '../preview/FormPreview';
import { rowAwareCollision } from './collision';

type ViewMode = 'edit' | 'detail' | 'form';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | TypeLayoutV2 | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayoutV2, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}


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

function findBlockInLayout(nodes: LayoutNodeV2[], id: string): LayoutBlockV2 | null {
  for (const node of nodes) {
    if (node.id === id && !isLayoutRowV2(node)) return node as LayoutBlockV2;
    if (isLayoutRowV2(node)) {
      const child = node.children.find((c) => c.id === id);
      if (child) return child;
    }
  }
  return null;
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

function initLayout(initialLayout: TypeLayout | TypeLayoutV2 | null, customFields: CustomField[]): TypeLayoutV2 {
  if (!initialLayout) return generateDefaultLayoutV2(customFields);
  if (initialLayout.version === 2) return initialLayout as TypeLayoutV2;
  return migrateV1toV2(initialLayout as TypeLayout);
}

export default function LayoutEditor({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const initialLayoutV2 = useMemo(
    () => initLayout(initialLayout, customFields),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { layout, update, undo, redo, canUndo, canRedo, hasUnsavedChanges } = useLayoutHistory(initialLayoutV2);

  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [isMobile, setIsMobile] = useState(false);
  const isEditing = viewMode === 'edit';

  // DnD overlay state
  const [activeNode, setActiveNode] = useState<LayoutNodeV2 | null>(null);
  const [activeType, setActiveType] = useState<'block' | 'row' | null>(null);
  const isDragActive = activeNode !== null;

  // Block selection / config drawer
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const selectedBlock = useMemo(
    () => (selectedBlockId ? findBlockInLayout(layout.blocks, selectedBlockId) : null),
    [selectedBlockId, layout.blocks],
  );

  // Responsive
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-scroll selected block into view on mobile
  useEffect(() => {
    if (!selectedBlockId || !isMobile) return;
    const el = document.querySelector(`[data-block-id="${selectedBlockId}"]`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [selectedBlockId, isMobile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
      }
      if (modifier && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedBlockId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        handleDeleteBlock(selectedBlockId);
        setSelectedBlockId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedBlockId]);

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
    const hasDesc = layout.blocks.some(
      (n) => n.type === 'description' || (isLayoutRowV2(n) && n.children.some((c) => c.type === 'description')),
    );
    if (hasDesc) set.add('description');
    return set;
  }, [layout.blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // --- Block selection ---

  const handleSelectBlock = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? null : blockId));
  }, []);

  // --- Quick add (mobile tap) ---

  const handleQuickAdd = useCallback((type: BlockTypeV2) => {
    const newBlock = createBlock(type);
    update({ ...layout, blocks: [...layout.blocks, newBlock] });
    setSelectedBlockId(newBlock.id);
  }, [layout, update]);

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;

    // Dismiss config drawer when drag starts
    setSelectedBlockId(null);

    if (data?.source === 'palette') {
      const paletteType = data.type as BlockTypeV2;
      const tempNode: LayoutNodeV2 = createBlock(paletteType);
      setActiveNode(tempNode);
      setActiveType('block');
      return;
    }

    const id = String(active.id);
    const found = findNode(layout.blocks, id);
    if (found) {
      setActiveNode(found);
      setActiveType(isLayoutRowV2(found) ? 'row' : 'block');
    }
  }, [layout.blocks]);

  const handleDrop = useCallback((
    activeId: string,
    activeData: Record<string, unknown>,
    targetData: Record<string, unknown>,
  ) => {
    const isPalette = activeData.source === 'palette';
    const targetZone = targetData.zone as string;
    const targetIndex = targetData.index as number;

    const blocks = [...layout.blocks];

    if (isPalette) {
      const paletteType = activeData.type as BlockTypeV2;
      const newNode: LayoutNodeV2 = createBlock(paletteType);

      if (targetZone === 'top-level') {
        blocks.splice(targetIndex, 0, newNode);
        update({ ...layout, blocks });
        return;
      }

      if (targetZone === 'row') {
        const rowId = targetData.rowId as string;
        const rowIdx = blocks.findIndex((b) => b.id === rowId);
        if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
          const row = blocks[rowIdx] as LayoutRowV2;
          if (row.children.length < 4 && !isLayoutRowV2(newNode)) {
            const children = [...row.children];
            children.splice(targetIndex, 0, newNode as LayoutBlockV2);
            blocks[rowIdx] = { ...row, children };
            update({ ...layout, blocks });
          }
        }
        return;
      }

      if (targetZone === 'side') {
        const blockId = targetData.blockId as string;
        const side = targetData.side as 'left' | 'right';
        const isInRow = targetData.isInRow as boolean;

        if (isInRow) {
          // Find parent row and insert new block at the correct position
          const rowIdx = blocks.findIndex(
            (b) => isLayoutRowV2(b) && (b as LayoutRowV2).children.some((c) => c.id === blockId),
          );
          if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
            const row = blocks[rowIdx] as LayoutRowV2;
            if (row.children.length < 4) {
              const childIdx = row.children.findIndex((c) => c.id === blockId);
              const insertIdx = side === 'left' ? childIdx : childIdx + 1;
              const children = [...row.children];
              children.splice(insertIdx, 0, { ...(newNode as LayoutBlockV2), width: '1/2' });
              blocks[rowIdx] = { ...row, children };
              update({ ...layout, blocks });
            }
          }
        } else {
          // Create new row from standalone block
          const blockIdx = blocks.findIndex((b) => b.id === blockId);
          if (blockIdx !== -1 && !isLayoutRowV2(blocks[blockIdx])) {
            const existingBlock = { ...blocks[blockIdx] as LayoutBlockV2, width: '1/2' as FractionalWidth };
            const newBlockWithWidth = { ...(newNode as LayoutBlockV2), width: '1/2' as FractionalWidth };
            const newRow: LayoutRowV2 = {
              id: nanoid(10),
              type: 'row',
              children: side === 'left'
                ? [newBlockWithWidth, existingBlock]
                : [existingBlock, newBlockWithWidth],
              gap: 'normal',
            };
            blocks[blockIdx] = newRow;
            update({ ...layout, blocks });
          }
        }
        return;
      }

      return;
    }

    // --- Existing block move ---
    let movingNode: LayoutNodeV2 | null = null;
    let sourceRowId: string | null = null;
    let sourceChildIdx = -1;
    let topIdx = -1;

    const topLevelIdx = blocks.findIndex((b) => b.id === activeId);
    if (topLevelIdx !== -1) {
      movingNode = blocks[topLevelIdx];
      topIdx = topLevelIdx;
      blocks.splice(topLevelIdx, 1);
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
              // Unwrap single-child row
              blocks[i] = { ...remaining[0], width: undefined };
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
      if (topIdx !== -1 && topIdx < targetIndex) {
        adjustedIndex--;
      }
      const node = isLayoutRowV2(movingNode) ? movingNode : (movingNode as LayoutBlockV2);
      blocks.splice(Math.min(adjustedIndex, blocks.length), 0, node);
      update({ ...layout, blocks });
      return;
    }

    if (targetZone === 'row') {
      if (isLayoutRowV2(movingNode)) return; // No nested rows
      const rowId = targetData.rowId as string;
      const rowIdx = blocks.findIndex((b) => b.id === rowId);
      if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
        const row = blocks[rowIdx] as LayoutRowV2;
        if (row.children.length < 4) {
          const children = [...row.children];
          let adjustedIndex = targetIndex;
          if (sourceRowId === rowId && sourceChildIdx < targetIndex) {
            adjustedIndex--;
          }
          children.splice(Math.min(adjustedIndex, children.length), 0, movingNode as LayoutBlockV2);
          blocks[rowIdx] = { ...row, children };
          update({ ...layout, blocks });
        }
      }
      return;
    }

    if (targetZone === 'side') {
      if (isLayoutRowV2(movingNode)) return; // No nested rows
      const blockId = targetData.blockId as string;
      const side = targetData.side as 'left' | 'right';
      const isInRow = targetData.isInRow as boolean;

      if (isInRow) {
        const rowIdx = blocks.findIndex(
          (b) => isLayoutRowV2(b) && (b as LayoutRowV2).children.some((c) => c.id === blockId),
        );
        if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
          const row = blocks[rowIdx] as LayoutRowV2;
          if (row.children.length < 4) {
            const childIdx = row.children.findIndex((c) => c.id === blockId);
            const insertIdx = side === 'left' ? childIdx : childIdx + 1;
            const children = [...row.children];
            children.splice(insertIdx, 0, { ...(movingNode as LayoutBlockV2), width: '1/2' });
            blocks[rowIdx] = { ...row, children };
            update({ ...layout, blocks });
          }
        }
      } else {
        const blockIdx = blocks.findIndex((b) => b.id === blockId);
        if (blockIdx !== -1 && !isLayoutRowV2(blocks[blockIdx])) {
          const existingBlock = { ...blocks[blockIdx] as LayoutBlockV2, width: '1/2' as FractionalWidth };
          const movedBlockWithWidth = { ...(movingNode as LayoutBlockV2), width: '1/2' as FractionalWidth };
          const newRow: LayoutRowV2 = {
            id: nanoid(10),
            type: 'row',
            children: side === 'left'
              ? [movedBlockWithWidth, existingBlock]
              : [existingBlock, movedBlockWithWidth],
            gap: 'normal',
          };
          blocks[blockIdx] = newRow;
          update({ ...layout, blocks });
        }
      }
      return;
    }
  }, [layout, update]);

  const handleReorder = useCallback((activeId: string, overId: string) => {
    const oldIndex = layout.blocks.findIndex((b) => b.id === activeId);
    const newIndex = layout.blocks.findIndex((b) => b.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    update({ ...layout, blocks: arrayMove(layout.blocks, oldIndex, newIndex) });
  }, [layout, update]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNode(null);
    setActiveType(null);

    if (!over) return;

    const activeData = active.data.current as Record<string, unknown>;
    const overData = over.data.current as Record<string, unknown>;

    if (overData?.zone) {
      handleDrop(String(active.id), activeData ?? {}, overData);
      return;
    }

    if (active.id !== over.id) {
      handleReorder(String(active.id), String(over.id));
    }
  }, [handleDrop, handleReorder]);

  // --- Mutation handlers ---

  const handleConfigChange = useCallback((blockId: string, config: BlockConfigV2) => {
    update({
      ...layout,
      blocks: layout.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRowV2(node)) {
          return { ...node, config };
        }
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((c) => (c.id === blockId ? { ...c, config } : c)),
          };
        }
        return node;
      }),
    });
  }, [layout, update]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    const newBlocks: LayoutNodeV2[] = [];
    for (const node of layout.blocks) {
      if (node.id === blockId) continue;
      if (isLayoutRowV2(node)) {
        const remaining = node.children.filter((c) => c.id !== blockId);
        if (remaining.length === 0) continue;
        if (remaining.length === 1) {
          newBlocks.push({ ...remaining[0], width: undefined });
        } else {
          newBlocks.push({ ...node, children: remaining });
        }
      } else {
        newBlocks.push(node);
      }
    }
    update({
      ...layout,
      blocks: newBlocks,
    });
    setSelectedBlockId((prev) => (prev === blockId ? null : prev));
  }, [layout, update]);

  const handleCreateField = useCallback((field: { name: string; field_type: string; options: string[]; required: boolean }) => {
    const tempId = `temp-${nanoid(10)}`;
    setPendingFields((prev) => [...prev, { ...field, tempId }]);
    // Assign the new field to the first empty field_display block
    const updatedBlocks = layout.blocks.map((node) => {
      if (!isLayoutRowV2(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
        return { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfigV2 };
      }
      return node;
    });
    update({ ...layout, blocks: updatedBlocks });
  }, [layout, update]);

  const handleSpacingChange = useCallback((spacing: SpacingPreset) => {
    update({ ...layout, spacing });
  }, [layout, update]);

  const handlePermissionsChange = useCallback((nodeId: string, permissions: BlockPermissions | undefined) => {
    function applyPermissions<T extends LayoutNodeV2>(n: T): T {
      return permissions ? { ...n, permissions } : { ...n, permissions: undefined };
    }

    update({
      ...layout,
      blocks: layout.blocks.map((node) => {
        if (node.id === nodeId) return applyPermissions(node);
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((child) =>
              child.id === nodeId ? applyPermissions(child) : child,
            ),
          };
        }
        return node;
      }),
    });
  }, [layout, update]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(layout, pendingFields.map(({ tempId, ...rest }) => rest));
    } finally {
      setSaving(false);
    }
  };

  // --- Shared sub-components ---

  const undoRedoButtons = (
    <>
      <button
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-forest hover:bg-sage-light/50' : 'text-sage/40 cursor-not-allowed'}`}
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-forest hover:bg-sage-light/50' : 'text-sage/40 cursor-not-allowed'}`}
      >
        <Redo2 size={16} />
      </button>
    </>
  );

  const viewToggle = (
    <div className="flex rounded-md border border-sage-light overflow-hidden text-sm">
      {(['edit', 'detail', 'form'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => { setViewMode(mode); if (mode !== 'edit') setSelectedBlockId(null); }}
          className={`px-3 py-1.5 font-medium transition-colors ${viewMode === mode ? 'bg-forest text-white' : 'bg-white text-forest-dark hover:bg-sage-light/50'}`}
        >
          {mode === 'edit' ? 'Edit' : mode === 'detail' ? 'Preview' : 'Form'}
        </button>
      ))}
    </div>
  );

  const detailCardView = (
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
    </div>
  );

  const currentView = viewMode === 'form'
    ? <FormPreview layout={layout} customFields={allFields} itemTypeName={itemType.name} />
    : detailCardView;

  // Config drawer (shown on top of everything on desktop, inline on mobile)
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

  // --- Mobile layout ---
  if (isMobile) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={rowAwareCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ height: '100dvh' }}>
          {/* Mobile header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light flex-shrink-0">
            <button onClick={onCancel} className="text-sm text-forest font-medium">
              Cancel
            </button>
            <span className="text-sm font-semibold text-forest-dark">{itemType.name} Layout</span>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 py-1.5 relative">
              {saving ? 'Saving...' : 'Done'}
              {hasUnsavedChanges && !saving && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
              )}
            </button>
          </div>

          {/* Mobile toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-sage-light flex-shrink-0">
            {viewToggle}
            <div className="flex items-center gap-1">
              {undoRedoButtons}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4">
            {currentView}
          </div>

          {/* Mobile FAB + component drawer */}
          {isEditing && (
            <ComponentDrawer
              isMobile
              disabledTypes={disabledTypes}
              onQuickAdd={handleQuickAdd}
            />
          )}

          {/* Spacing picker strip (edit mode, hidden when config drawer is open) */}
          {isEditing && !selectedBlock && (
            <div className="px-4 py-2 border-t border-sage-light flex-shrink-0">
              <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
            </div>
          )}

          {/* Config drawer — inline, pushes content up */}
          <ConfigDrawer {...configDrawerProps} isMobile />
        </div>

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
  }

  // --- Desktop layout ---
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rowAwareCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col min-h-[600px]">
        {/* Desktop header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-forest-dark">{itemType.name} Layout</h3>
          <div className="flex items-center gap-2">
            {undoRedoButtons}
            <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm relative">
              {saving ? 'Saving...' : 'Save Layout'}
              {hasUnsavedChanges && !saving && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
              )}
            </button>
          </div>
        </div>

        {/* Desktop toolbar */}
        <div className="flex items-center gap-4 mb-4">
          {viewToggle}
          {isEditing && (
            <div className="flex-1 max-w-xs">
              <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
            </div>
          )}
        </div>

        {/* Desktop content area */}
        <div className="flex gap-4 flex-1">
          {/* Sidebar — component drawer, edit mode only */}
          {isEditing && (
            <div className="flex-shrink-0">
              <ComponentDrawer
                isMobile={false}
                disabledTypes={disabledTypes}
                onQuickAdd={handleQuickAdd}
              />
            </div>
          )}

          {/* Centered preview card */}
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-[480px]">
              {currentView}
            </div>
          </div>
        </div>
      </div>

      {/* Config drawer — desktop overlay */}
      <ConfigDrawer {...configDrawerProps} />

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
}
