'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { LayoutNode, LayoutBlock, LayoutRow, BlockConfig } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
import RowEditor from './RowEditor';
import PeekBoundary from './PeekBoundary';
import { useState } from 'react';

interface Props {
  nodes: LayoutNode[];
  customFields: CustomField[];
  entityTypes: EntityType[];
  peekBlockCount: number;
  onReorder: (activeId: string, overId: string) => void;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDeleteBlock: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  onPeekCountChange: (count: number) => void;
  onRowChange: (rowId: string, update: Partial<Pick<LayoutRow, 'gap' | 'distribution'>>) => void;
  onAddToRow: (rowId: string, blockType: string) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
}

export default function BlockList({
  nodes,
  customFields,
  entityTypes,
  peekBlockCount,
  onReorder,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onPeekCountChange,
  onRowChange,
  onAddToRow,
  onRemoveFromRow,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  const fieldMap = new Map(customFields.map((f) => [f.id, f]));
  const nodeIds = nodes.map((n) => n.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={nodeIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
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
                  onAddToRow={onAddToRow}
                  onRemoveFromRow={onRemoveFromRow}
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
    </DndContext>
  );
}
