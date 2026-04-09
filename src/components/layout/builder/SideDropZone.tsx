'use client';

import { useDroppable } from '@dnd-kit/core';

interface SideDropZoneProps {
  id: string;
  side: 'left' | 'right';
  parentBlockId: string;
  parentBlockIndex: number;
  isInRow: boolean;
  disabled: boolean;
}

export default function SideDropZone({
  id,
  side,
  parentBlockId,
  parentBlockIndex,
  isInRow,
  disabled,
}: SideDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      zone: 'side',
      side,
      blockId: parentBlockId,
      blockIndex: parentBlockIndex,
      isInRow,
    },
    disabled,
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    [side]: 0,
    width: '20px',
    height: '100%',
    zIndex: 10,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`transition-colors duration-150 rounded ${
        isOver && !disabled ? 'bg-forest/10' : ''
      }`}
    />
  );
}
