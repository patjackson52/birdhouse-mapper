'use client';

import { useEffect } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import UpdateCard from './UpdateCard';

interface AllUpdatesSheetProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateTap: (update: TimelineUpdate) => void;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function AllUpdatesSheet({
  updates,
  updateTypeFields,
  isOpen,
  onClose,
  onUpdateTap,
  showPhotos,
  showFieldValues,
  showEntityChips,
}: AllUpdatesSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white w-full md:max-w-lg md:rounded-xl md:shadow-2xl md:max-h-[85vh] h-full md:h-auto flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-sage-light/50 shrink-0">
          <h2 className="font-semibold text-forest-dark">All updates ({updates.length})</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-md text-sage hover:bg-sage-light/40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {updates.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => onUpdateTap(u)}
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
