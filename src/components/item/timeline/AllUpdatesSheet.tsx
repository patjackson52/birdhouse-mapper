'use client';

import type { EnrichedUpdate } from '@/lib/types';
import { RailCard } from './RailCard';
import './timeline.css';

export function AllUpdatesSheet({
  updates,
  onClose,
  onOpen,
}: {
  updates: EnrichedUpdate[];
  onClose: () => void;
  onOpen: (u: EnrichedUpdate) => void;
}) {
  return (
    <div className="fm-slide-up fixed inset-0 z-[100] flex flex-col bg-parchment">
      <header className="flex items-center justify-between border-b border-forest-border-soft bg-white px-4 pb-3 pt-[58px]">
        <h2 className="font-heading text-lg font-medium text-forest-dark">All updates</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-light"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 pt-4">
        {updates.map((u, i) => (
          <RailCard
            key={u.id}
            update={u}
            onOpen={() => onOpen(u)}
            isLast={i === updates.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
