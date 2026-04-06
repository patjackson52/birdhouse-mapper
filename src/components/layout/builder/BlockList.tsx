'use client';

import { useState, useMemo } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { LayoutNode, LayoutRow, BlockConfig } from '@/lib/layout/types';
import { isLayoutRow } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
import RowEditor from './RowEditor';
import PeekBoundary from './PeekBoundary';
import DropZone from './DropZone';

interface Props {
  nodes: LayoutNode[];
  customFields: CustomField[];
  entityTypes: EntityType[];
  peekBlockCount: number;
  activeType: 'block' | 'row' | null;
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
  activeType,
  onConfigChange,
  onDeleteBlock,
  onCreateField,
  onPeekCountChange,
  onRowChange,
  onRemoveFromRow,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fieldMap = useMemo(() => new Map(customFields.map((f) => [f.id, f])), [customFields]);
  const nodeIds = nodes.map((n) => n.id);

  return (
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
  );
}
