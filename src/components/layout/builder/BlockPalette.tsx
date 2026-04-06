'use client';

import { useDraggable } from '@dnd-kit/core';
import type { BlockType } from '@/lib/layout/types';

interface PaletteItem {
  type: BlockType | 'row';
  icon: string;
  label: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
  { type: 'row', icon: '⬜', label: 'Row' },
];

function PaletteChip({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, source: 'palette' },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to add ${item.label}`}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white hover:bg-sage-light/50 text-sm font-medium text-forest-dark transition-colors min-h-[44px] cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

export default function BlockPalette() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PALETTE_ITEMS.map((item) => (
        <PaletteChip key={item.type} item={item} />
      ))}
    </div>
  );
}
