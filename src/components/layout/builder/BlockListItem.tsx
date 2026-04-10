'use client';

import { useState, forwardRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LayoutBlock } from '@/lib/layout/types';
import type { CustomField, EntityType } from '@/lib/types';
import BlockConfigPanel from './BlockConfigPanel';
import type { BlockConfig } from '@/lib/layout/types';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const BLOCK_LABELS: Record<string, string> = {
  field_display: 'Field',
  photo_gallery: 'Photo Gallery',
  status_badge: 'Status Badge',
  entity_list: 'Entities',
  text_label: 'Text',
  divider: 'Divider',
  action_buttons: 'Actions',
  map_snippet: 'Map',
  timeline: 'Timeline',
};

interface Props {
  block: LayoutBlock;
  customFields: CustomField[];
  entityTypes: EntityType[];
  fieldName?: string;
  onConfigChange: (blockId: string, config: BlockConfig) => void;
  onDelete: (blockId: string) => void;
  onCreateField: (field: { name: string; field_type: string; options: string[]; required: boolean }) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const BlockListItem = forwardRef<HTMLDivElement, Props>(function BlockListItem(
  { block, customFields, entityTypes, fieldName, onConfigChange, onDelete, onCreateField, isExpanded, onToggleExpand },
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
    opacity: isDragging ? 0.3 : 1,
  };

  const label = block.type === 'field_display' && fieldName
    ? fieldName
    : BLOCK_LABELS[block.type] ?? block.type;

  return (
    <div
      ref={mergedRef}
      style={style}
      className="border border-sage-light rounded-lg bg-white cursor-grab active:cursor-grabbing touch-none"
      {...attributes}
      {...listeners}
    >
      {/* Header row */}
      <div className="flex items-center min-h-[48px]">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="flex-1 flex items-center gap-2 py-2 pl-3 text-left"
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
            <button onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} className="text-xs text-red-600 font-medium px-2 py-1">
              Delete
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="text-xs text-sage px-2 py-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            className="p-3 text-sage hover:text-red-500 transition-colors"
            aria-label="Delete block"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Config panel (accordion) */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-sage-light/50" onPointerDown={(e) => e.stopPropagation()}>
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
