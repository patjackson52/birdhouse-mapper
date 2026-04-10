'use client';

import { useState, useCallback, useEffect } from 'react';
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
import type { TypeLayout, LayoutNode, LayoutBlock, LayoutRow, BlockType, BlockConfig, SpacingPreset } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { generateDefaultLayout } from '@/lib/layout/defaults';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPalette from './BlockPalette';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRenderer from '../LayoutRenderer';
import DragOverlayContent from './DragOverlayContent';
import { rowAwareCollision } from './collision';

interface Props {
  itemType: ItemType;
  initialLayout: TypeLayout | null;
  customFields: CustomField[];
  entityTypes: EntityType[];
  onSave: (layout: TypeLayout, newFields: { name: string; field_type: string; options: string[]; required: boolean }[]) => Promise<void>;
  onCancel: () => void;
}


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

export default function LayoutBuilder({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayout>(
    () => initialLayout ?? generateDefaultLayout(customFields),
  );
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<'edit' | 'preview'>('edit');
  const [activeTab, setActiveTab] = useState<'build' | 'edit' | 'preview'>('build');
  const [activeNode, setActiveNode] = useState<LayoutNode | null>(null);
  const [activeType, setActiveType] = useState<'block' | 'row' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleRightPanelModeChange = useCallback((mode: 'edit' | 'preview') => {
    setRightPanelMode(mode);
    if (mode === 'preview') {
      setSelectedBlockId(null);
    }
  }, []);

  const handleBlockSelectFromPreview = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    if (isMobile && blockId) {
      setActiveTab('build');
    }
  }, [isMobile]);

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

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;

    if (data?.source === 'palette') {
      // Create a temporary node for the overlay preview
      const paletteType = data.type as BlockType | 'row';
      const tempNode: LayoutNode = paletteType === 'row' ? createRow() : createBlock(paletteType);
      setActiveNode(tempNode);
      setActiveType(paletteType === 'row' ? 'row' : 'block');
      return;
    }

    // Existing block/row drag
    const id = String(active.id);
    const found = findNode(layout.blocks, id);
    if (found) {
      setActiveNode(found);
      setActiveType(isLayoutRow(found) ? 'row' : 'block');
    }
  }, [layout.blocks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNode(null);
    setActiveType(null);

    if (!over) return;

    const activeData = active.data.current as Record<string, unknown>;
    const overData = over.data.current as Record<string, unknown>;

    // If over target has zone data, it's a drop zone
    if (overData?.zone) {
      handleDrop(String(active.id), activeData ?? {}, overData);
      return;
    }

    // Otherwise it's a sortable reorder
    if (active.id !== over.id) {
      handleReorder(String(active.id), String(over.id));
    }
  }, []);

  // Unified drop handler for all drag-and-drop scenarios
  const handleDrop = useCallback((activeId: string, activeData: Record<string, unknown>, targetData: Record<string, unknown>) => {
    const isPalette = activeData.source === 'palette';
    const targetZone = targetData.zone as string;
    const targetIndex = targetData.index as number;

    setLayout((prev) => {
      const blocks = [...prev.blocks];

      if (isPalette) {
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
      let sourceRowId: string | null = null;
      let sourceChildIdx = -1;

      const topIdx = blocks.findIndex((b) => b.id === activeId);
      if (topIdx !== -1) {
        movingNode = blocks[topIdx];
        blocks.splice(topIdx, 1);
      } else {
        for (let i = 0; i < blocks.length; i++) {
          const node = blocks[i];
          if (isLayoutRow(node)) {
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

      if (!movingNode) return prev;

      if (targetZone === 'top-level') {
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
            // Adjust index for same-row moves
            let adjustedIndex = targetIndex;
            if (sourceRowId === rowId && sourceChildIdx < targetIndex) {
              adjustedIndex--;
            }
            children.splice(Math.min(adjustedIndex, children.length), 0, movingNode as LayoutBlock);
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
      blocks: prev.blocks.flatMap((node) => {
        if (node.id !== rowId || !isLayoutRow(node)) return [node];
        const remaining = node.children.filter((c) => c.id !== blockId);
        if (remaining.length === 0) return [];
        if (remaining.length === 1) return [remaining[0]];
        return [{ ...node, children: remaining }];
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
        activeType={activeType}
        selectedBlockId={selectedBlockId}
        onBlockSelect={setSelectedBlockId}
        onConfigChange={handleConfigChange}
        onDeleteBlock={handleDeleteBlock}
        onCreateField={handleCreateField}
        onPeekCountChange={handlePeekCountChange}
        onRowChange={handleRowChange}
        onRemoveFromRow={handleRemoveFromRow}
      />
    </div>
  );

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
            selectedBlockId={selectedBlockId ?? undefined}
            onBlockSelect={handleBlockSelectFromPreview}
          />
        </div>
      </div>
    </div>
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
          />
        ) : null}
      </DragOverlay>
    </DndContext>
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
          {activeTab === 'build' && dndWrapped(buildContent)}
          {(activeTab === 'edit' || activeTab === 'preview') && unifiedPreview}
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
        {dndWrapped(buildContent)}
      </div>

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
    </div>
  );
}
