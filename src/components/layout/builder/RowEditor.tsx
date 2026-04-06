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

  const { setNodeRef: setBoundsRef } = useDroppable({
    id: `row-bounds-${row.id}`,
    data: { zone: 'row-bounds', rowId: row.id },
    disabled: true,
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
