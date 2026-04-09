'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { BlockTypeV2 } from '@/lib/layout/types-v2';

interface PaletteItem {
  type: BlockTypeV2 | 'row';
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
  { type: 'description', icon: '📝', label: 'Description' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'map_snippet', icon: '📍', label: 'Map' },
  { type: 'action_buttons', icon: '🔘', label: 'Actions' },
  { type: 'row', icon: '⬜', label: 'Row' },
];

const SCROLL_AMOUNT = 160;

function PaletteChip({ item, disabled }: { item: PaletteItem; disabled: boolean }) {
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
      aria-label={`Drag to add ${item.label}`}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-sage-light bg-white text-sm font-medium text-forest-dark transition-colors min-h-[44px] select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-sage-light/50 cursor-grab active:cursor-grabbing touch-none'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </div>
  );
}

function ScrollArrow({ direction, onClick, visible }: { direction: 'left' | 'right'; onClick: () => void; visible: boolean }) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      aria-label={`Scroll ${direction}`}
      className={`absolute top-0 ${direction === 'left' ? 'left-0' : 'right-0'} z-10 h-full flex items-center px-1 bg-gradient-to-${direction === 'left' ? 'r' : 'l'} from-white via-white/90 to-transparent`}
    >
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-sage-light shadow-sm text-forest-dark hover:bg-sage-light/50 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {direction === 'left'
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          }
        </svg>
      </span>
    </button>
  );
}

interface Props {
  disabledTypes?: Set<string>;
}

export default function BlockPaletteV2({ disabledTypes }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative">
      <ScrollArrow direction="left" onClick={() => scroll('left')} visible={canScrollLeft} />
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide"
      >
        {PALETTE_ITEMS.map((item) => (
          <PaletteChip
            key={item.type}
            item={item}
            disabled={disabledTypes?.has(item.type) ?? false}
          />
        ))}
      </div>
      <ScrollArrow direction="right" onClick={() => scroll('right')} visible={canScrollRight} />
    </div>
  );
}
