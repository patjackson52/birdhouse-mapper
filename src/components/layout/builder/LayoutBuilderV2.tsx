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
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, LayoutRowV2, BlockTypeV2, BlockConfigV2, SpacingPreset, FractionalWidth, BlockPermissions } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { CustomField, EntityType, ItemType } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import { generateDefaultLayoutV2 } from '@/lib/layout/defaults-v2';
import { migrateV1toV2 } from '@/lib/layout/migration';
import { generateMockItem } from '@/lib/layout/mock-data';
import BlockPaletteV2 from './BlockPaletteV2';
import BlockList from './BlockList';
import SpacingPicker from './SpacingPicker';
import LayoutRendererDispatch from '../LayoutRendererDispatch';
import FormPreview from '../preview/FormPreview';
import DragOverlayContent from './DragOverlayContent';
import { rowAwareCollision } from './collision';

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

function createRow(): LayoutRowV2 {
  return {
    id: nanoid(10),
    type: 'row',
    children: [
      { id: nanoid(10), type: 'status_badge', config: {}, width: '1/2' },
      { id: nanoid(10), type: 'status_badge', config: {}, width: '1/2' },
    ],
    gap: 'normal',
  };
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

export default function LayoutBuilderV2({ itemType, initialLayout, customFields, entityTypes, onSave, onCancel }: Props) {
  const [layout, setLayout] = useState<TypeLayoutV2>(() => {
    if (!initialLayout) return generateDefaultLayoutV2(customFields);
    if (initialLayout.version === 2) return initialLayout as TypeLayoutV2;
    return migrateV1toV2(initialLayout as TypeLayout);
  });
  const [pendingFields, setPendingFields] = useState<{ name: string; field_type: string; options: string[]; required: boolean; tempId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'detail' | 'form'>('build');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('detail');
  const [activeNode, setActiveNode] = useState<LayoutNodeV2 | null>(null);
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
    const hasDesc = layout.blocks.some((n) => n.type === 'description' || (isLayoutRowV2(n) && n.children.some((c) => c.type === 'description')));
    if (hasDesc) set.add('description');
    return set;
  }, [layout.blocks]);

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as Record<string, unknown> | undefined;

    if (data?.source === 'palette') {
      const paletteType = data.type as BlockTypeV2 | 'row';
      const tempNode: LayoutNodeV2 = paletteType === 'row' ? createRow() : createBlock(paletteType);
      setActiveNode(tempNode);
      setActiveType(paletteType === 'row' ? 'row' : 'block');
      return;
    }

    const id = String(active.id);
    const found = findNode(layout.blocks, id);
    if (found) {
      setActiveNode(found);
      setActiveType(isLayoutRowV2(found) ? 'row' : 'block');
    }
  }, [layout.blocks]);

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
  }, []);

  const handleDrop = useCallback((activeId: string, activeData: Record<string, unknown>, targetData: Record<string, unknown>) => {
    const isPalette = activeData.source === 'palette';
    const targetZone = targetData.zone as string;
    const targetIndex = targetData.index as number;

    setLayout((prev) => {
      const blocks = [...prev.blocks];

      if (isPalette) {
        const paletteType = activeData.type as BlockTypeV2 | 'row';
        const newNode: LayoutNodeV2 = paletteType === 'row' ? createRow() : createBlock(paletteType);

        if (targetZone === 'top-level') {
          blocks.splice(targetIndex, 0, newNode);
        } else if (targetZone === 'row') {
          const rowId = targetData.rowId as string;
          const rowIdx = blocks.findIndex((b) => b.id === rowId);
          if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx])) {
            const row = blocks[rowIdx] as LayoutRowV2;
            if (row.children.length < 4 && !isLayoutRowV2(newNode)) {
              const children = [...row.children];
              children.splice(targetIndex, 0, newNode as LayoutBlockV2);
              blocks[rowIdx] = { ...row, children };
            }
          }
        }

        return { ...prev, blocks };
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
        if (rowIdx !== -1 && isLayoutRowV2(blocks[rowIdx]) && !isLayoutRowV2(movingNode)) {
          const row = blocks[rowIdx] as LayoutRowV2;
          if (row.children.length < 4) {
            const children = [...row.children];
            let adjustedIndex = targetIndex;
            if (sourceRowId === rowId && sourceChildIdx < targetIndex) {
              adjustedIndex--;
            }
            children.splice(Math.min(adjustedIndex, children.length), 0, movingNode as LayoutBlockV2);
            blocks[rowIdx] = { ...row, children };
          }
        }
      }

      return { ...prev, blocks };
    });
  }, []);

  const handleReorder = useCallback((activeId: string, overId: string) => {
    setLayout((prev) => {
      const oldIndex = prev.blocks.findIndex((b) => b.id === activeId);
      const newIndex = prev.blocks.findIndex((b) => b.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, blocks: arrayMove(prev.blocks, oldIndex, newIndex) };
    });
  }, []);

  const handleConfigChange = useCallback((blockId: string, config: BlockConfigV2) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === blockId && !isLayoutRowV2(node)) {
          return { ...node, config };
        }
        if (isLayoutRowV2(node)) {
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
        if (!isLayoutRowV2(node) && node.type === 'field_display' && !(node.config as { fieldId: string }).fieldId) {
          blocks[i] = { ...node, config: { ...(node.config as object), fieldId: tempId } as BlockConfigV2 };
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

  const handleRowChange = useCallback((rowId: string, update: Partial<Pick<LayoutRowV2, 'gap'>>) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) =>
        node.id === rowId && isLayoutRowV2(node) ? { ...node, ...update } : node,
      ),
    }));
  }, []);

  const handleWidthChange = useCallback((blockId: string, width: FractionalWidth) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((child) =>
              child.id === blockId ? { ...child, width } : child
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handlePermissionsChange = useCallback((nodeId: string, permissions: BlockPermissions | undefined) => {
    function applyPermissions<T extends LayoutNodeV2>(n: T): T {
      return permissions ? { ...n, permissions } : { ...n, permissions: undefined };
    }

    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((node) => {
        if (node.id === nodeId) return applyPermissions(node);
        if (isLayoutRowV2(node)) {
          return {
            ...node,
            children: node.children.map((child) =>
              child.id === nodeId ? applyPermissions(child) : child
            ),
          };
        }
        return node;
      }),
    }));
  }, []);

  const handleRemoveFromRow = useCallback((rowId: string, blockId: string) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.flatMap((node) => {
        if (node.id !== rowId || !isLayoutRowV2(node)) return [node];
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
      <BlockPaletteV2 disabledTypes={disabledTypes} />
      <SpacingPicker value={layout.spacing} onChange={handleSpacingChange} />
      <BlockList
        nodes={layout.blocks as any}
        customFields={allFields}
        entityTypes={entityTypes}
        peekBlockCount={layout.peekBlockCount}
        activeType={activeType}
        onConfigChange={handleConfigChange as any}
        onDeleteBlock={handleDeleteBlock}
        onCreateField={handleCreateField}
        onPeekCountChange={handlePeekCountChange}
        onRowChange={handleRowChange as any}
        onRemoveFromRow={handleRemoveFromRow}
      />
    </div>
  );

  const detailPreview = (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <IconRenderer icon={itemType.icon} size={24} />
          <h2 className="font-heading font-semibold text-forest-dark text-xl">{mockItem.name}</h2>
        </div>
        <LayoutRendererDispatch
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
          {activeTab === 'build' && dndWrapped(buildContent)}
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
        {dndWrapped(buildContent)}
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
