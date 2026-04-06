'use client';

import { useDroppable } from '@dnd-kit/core';

interface DropZoneProps {
  id: string;
  data: Record<string, unknown>;
  direction: 'vertical' | 'horizontal';
  disabled?: boolean;
}

const COLLAPSED_SIZE = '8px';
const EXPANDED_SIZE = '80px';

export default function DropZone({ id, data, direction, disabled = false }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled });

  const isVertical = direction === 'vertical';
  const expanded = isOver && !disabled;

  const style: React.CSSProperties = {
    transition: isVertical
      ? 'height 200ms ease-out'
      : 'width 200ms ease-out',
    ...(isVertical
      ? { height: expanded ? EXPANDED_SIZE : COLLAPSED_SIZE, width: '100%' }
      : { width: expanded ? EXPANDED_SIZE : COLLAPSED_SIZE, height: '100%' }),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg transition-colors ${expanded ? 'bg-forest/5' : ''}`}
    />
  );
}
