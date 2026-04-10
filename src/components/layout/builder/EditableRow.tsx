'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { LayoutRowV2, LayoutBlockV2 } from '@/lib/layout/types-v2';
import DropZone from './DropZone';

interface EditableRowProps {
  row: LayoutRowV2;
  rowIndex: number;
  selectedBlockId: string | null;
  isDragActive: boolean;
  onSelect: (blockId: string) => void;
  renderBlock: (block: LayoutBlockV2, index: number, isInRow: boolean, rowChildCount: number) => React.ReactNode;
}

export default function EditableRow({
  row,
  rowIndex,
  selectedBlockId,
  isDragActive,
  onSelect,
  renderBlock,
}: EditableRowProps) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: row.id,
    data: { isRow: true },
  });

  // Row bounds droppable for collision detection
  const { setNodeRef: boundsRef } = useDroppable({
    id: `row-bounds-${row.id}`,
    data: { zone: 'row-bounds', rowId: row.id },
    disabled: true,
  });

  const maxChildren = 4;
  const isFull = row.children.length >= maxChildren;

  return (
    <div
      ref={(el) => {
        dragRef(el);
        boundsRef(el);
      }}
      className={`relative rounded-lg transition-all duration-150 ${
        isDragging ? 'opacity-25' : ''
      } ${isDragActive ? 'border border-dashed border-sage/20' : ''}`}
    >
      {/* Drag handle for the row */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-1 -left-1 z-20 opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none p-1"
        aria-label="Drag to reorder row"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-sage">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </div>

      <div className="flex items-stretch" style={{ gap: row.gap === 'tight' ? 4 : row.gap === 'loose' ? 16 : 8 }}>
        {/* Horizontal drop zone before first child */}
        {isDragActive && (
          <DropZone
            id={`row-${row.id}-drop-0`}
            data={{ zone: 'row', rowId: row.id, index: 0 }}
            direction="horizontal"
            disabled={isFull}
          />
        )}

        {row.children.map((child, childIndex) => (
          <div key={child.id} className="flex items-stretch" style={{ width: widthToPercent(child.width) }}>
            {renderBlock(child, childIndex, true, row.children.length)}

            {/* Horizontal drop zone after each child */}
            {isDragActive && (
              <DropZone
                id={`row-${row.id}-drop-${childIndex + 1}`}
                data={{ zone: 'row', rowId: row.id, index: childIndex + 1 }}
                direction="horizontal"
                disabled={isFull}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function widthToPercent(width?: string): string | undefined {
  if (!width || width === 'full') return undefined;
  const map: Record<string, string> = {
    '1/4': '25%',
    '1/3': '33.333%',
    '1/2': '50%',
    '2/3': '66.667%',
    '3/4': '75%',
  };
  return map[width];
}
