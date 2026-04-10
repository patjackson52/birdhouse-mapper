'use client';

import { useState } from 'react';
import { useDraggable, useDndMonitor } from '@dnd-kit/core';
import { Plus, X } from 'lucide-react';
import type { BlockTypeV2 } from '@/lib/layout/types-v2';

interface PaletteItem {
  type: BlockTypeV2;
  icon: string;
  label: string;
}

// No "Row" — rows are created via side-drop
const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'field_display', icon: '📊', label: 'Field' },
  { type: 'photo_gallery', icon: '📷', label: 'Photo' },
  { type: 'status_badge', icon: '🏷', label: 'Status' },
  { type: 'entity_list', icon: '🔗', label: 'Entities' },
  { type: 'timeline', icon: '📋', label: 'Timeline' },
  { type: 'text_label', icon: '✏️', label: 'Text' },
  { type: 'description', icon: '📝', label: 'Description' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
];

interface Props {
  isMobile: boolean;
  disabledTypes: Set<string>;
  onQuickAdd: (type: BlockTypeV2) => void;
}

function DraggableChip({
  item,
  disabled,
  isMobile,
  onTap,
}: {
  item: PaletteItem;
  disabled: boolean;
  isMobile: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { type: item.type, source: 'palette' },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isMobile && !disabled) {
          e.stopPropagation();
          onTap();
        }
      }}
      aria-label={`${isMobile ? 'Tap to add' : 'Drag to add'} ${item.label}`}
      className={`flex items-center gap-2 rounded-lg border border-sage-light bg-white text-sm font-medium text-forest-dark transition-colors select-none touch-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isMobile
            ? 'active:bg-sage-light/50 min-h-[44px] px-3 py-2'
            : 'hover:bg-sage-light/50 cursor-grab active:cursor-grabbing px-3 py-2.5 w-full'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

export default function ComponentDrawer({ isMobile, disabledTypes, onQuickAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPaletteDragging, setIsPaletteDragging] = useState(false);

  useDndMonitor({
    onDragStart(event) {
      if (event.active.data.current?.source === 'palette') {
        setIsPaletteDragging(true);
      }
    },
    onDragEnd() {
      if (isPaletteDragging) {
        setIsPaletteDragging(false);
        setIsOpen(false);
      }
    },
    onDragCancel() {
      setIsPaletteDragging(false);
    },
  });

  if (!isMobile) {
    // Desktop: vertical sidebar
    return (
      <div className="flex flex-col gap-1.5 w-[140px] flex-shrink-0">
        {PALETTE_ITEMS.map((item) => (
          <DraggableChip
            key={item.type}
            item={item}
            disabled={disabledTypes.has(item.type)}
            isMobile={false}
            onTap={() => {}}
          />
        ))}
      </div>
    );
  }

  // Mobile: FAB + expandable drawer
  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Add component"
          className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-forest text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Plus size={24} />
        </button>
      )}

      {isOpen && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/20 transition-opacity ${isPaletteDragging ? 'opacity-0 pointer-events-none' : ''}`}
            onClick={() => setIsOpen(false)}
          />
          <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[50vh] overflow-y-auto transition-opacity ${isPaletteDragging ? 'opacity-0 pointer-events-none' : ''}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
              <span className="font-medium text-forest-dark">Add Component</span>
              <button onClick={() => setIsOpen(false)} aria-label="Close drawer">
                <X size={20} className="text-sage" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {PALETTE_ITEMS.map((item) => (
                <DraggableChip
                  key={item.type}
                  item={item}
                  disabled={disabledTypes.has(item.type)}
                  isMobile={true}
                  onTap={() => {
                    onQuickAdd(item.type);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
