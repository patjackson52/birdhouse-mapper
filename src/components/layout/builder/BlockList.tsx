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
      setActiveType(data.type === 'row' ? 'row' : 'block');
      return;
    }

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

    if (overData?.zone) {
      onDrop(String(active.id), activeData ?? {}, overData);
      return;
    }

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
