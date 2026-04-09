'use client';

import { useDraggable } from '@dnd-kit/core';
import SideDropZone from './SideDropZone';
import BlockToolbar from './BlockToolbar';

interface EditableBlockProps {
  blockId: string;
  blockIndex: number;
  isInRow: boolean;
  isSelected: boolean;
  isDragDisabled: boolean;
  rowChildCount: number;
  onSelect: (blockId: string) => void;
  onOpenConfig: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  children: React.ReactNode;
}

export default function EditableBlock({
  blockId,
  blockIndex,
  isInRow,
  isSelected,
  isDragDisabled,
  rowChildCount,
  onSelect,
  onOpenConfig,
  onDelete,
  children,
}: EditableBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: blockId,
    disabled: isDragDisabled,
  });

  const sideZonesDisabled = isInRow && rowChildCount >= 4;

  return (
    <div
      data-block-id={blockId}
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(blockId);
      }}
      className={`group relative flex flex-col rounded-lg transition-all duration-150 border-2 ${
        isDragging
          ? 'opacity-25 border-transparent'
          : isSelected
            ? 'border-forest'
            : 'border-transparent hover:border-dashed hover:border-sage/40'
      }`}
    >
      {/* Floating toolbar — shown when selected */}
      {isSelected && !isDragging && (
        <BlockToolbar
          onConfig={() => onOpenConfig(blockId)}
          onDelete={() => onDelete(blockId)}
          dragListeners={listeners}
          dragAttributes={attributes}
        />
      )}

      {/* Side drop zones for auto-row creation */}
      <SideDropZone
        id={`side-left-${blockId}`}
        side="left"
        parentBlockId={blockId}
        parentBlockIndex={blockIndex}
        isInRow={isInRow}
        disabled={sideZonesDisabled}
      />
      <SideDropZone
        id={`side-right-${blockId}`}
        side="right"
        parentBlockId={blockId}
        parentBlockIndex={blockIndex}
        isInRow={isInRow}
        disabled={sideZonesDisabled}
      />

      {children}
    </div>
  );
}
