'use client';

import { GripVertical, Settings, Trash2 } from 'lucide-react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

interface BlockToolbarProps {
  onConfig: () => void;
  onDelete: () => void;
  dragListeners?: SyntheticListenerMap;
  dragAttributes?: DraggableAttributes;
}

export default function BlockToolbar({
  onConfig,
  onDelete,
  dragListeners,
  dragAttributes,
}: BlockToolbarProps) {
  return (
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-sage-light px-1 py-0.5">
      <button
        {...dragAttributes}
        {...dragListeners}
        className="p-1.5 rounded hover:bg-sage-light/50 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} className="text-sage" />
      </button>
      <button
        onClick={onConfig}
        className="p-1.5 rounded hover:bg-sage-light/50"
        aria-label="Configure block"
      >
        <Settings size={14} className="text-sage" />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded hover:bg-red-50"
        aria-label="Delete block"
      >
        <Trash2 size={14} className="text-red-400" />
      </button>
    </div>
  );
}
