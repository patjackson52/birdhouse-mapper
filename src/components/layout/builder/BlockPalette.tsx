'use client';

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

interface Props {
  onAdd: (type: BlockType | 'row') => void;
}

export default function BlockPalette({ onAdd }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {PALETTE_ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => onAdd(item.type)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white hover:bg-sage-light/50 text-sm font-medium text-forest-dark transition-colors min-h-[44px]"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
