'use client';

import type { LayoutRow, BlockConfig, BlockType } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockListItem from './BlockListItem';
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
  onAddToRow: (rowId: string, blockType: string) => void;
  onRemoveFromRow: (rowId: string, blockId: string) => void;
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
  onAddToRow,
  onRemoveFromRow,
}: Props) {
  const [showRowConfig, setShowRowConfig] = useState(false);

  return (
    <div className="border-2 border-dashed border-sage rounded-lg p-2 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={() => setShowRowConfig(!showRowConfig)}
          className="flex items-center gap-2 text-sm font-medium text-forest-dark"
        >
          {showRowConfig ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Row ({row.children.length} columns, {typeof row.distribution === 'string' ? row.distribution : 'custom'})
        </button>
        <button
          onClick={() => onDeleteBlock(row.id)}
          className="p-2 text-sage hover:text-red-500"
          aria-label="Delete row"
        >
          <Trash2 className="w-4 h-4" />
        </button>
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

      {/* Children */}
      <div className="pl-3 border-l-2 border-sage-light space-y-2">
        {row.children.map((child) => (
          <BlockListItem
            key={child.id}
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
        ))}
        {row.children.length < 4 && (
          <button
            onClick={() => onAddToRow(row.id, 'field_display')}
            className="w-full py-2 border-2 border-dashed border-sage-light rounded-lg text-xs text-sage font-medium hover:border-forest hover:text-forest transition-colors min-h-[44px]"
          >
            + Add to row
          </button>
        )}
      </div>
    </div>
  );
}
