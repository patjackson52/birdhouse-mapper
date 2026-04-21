'use client';

import { useState } from 'react';
import type { EnrichedUpdate, UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import { RailCard } from './RailCard';

interface ScheduledUpdatesSectionProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  onUpdateTap: (update: TimelineUpdate) => void;
  showPhotos?: boolean;
  showFieldValues?: boolean;
  showEntityChips?: boolean;
}

export default function ScheduledUpdatesSection({
  updates,
  onUpdateTap,
}: ScheduledUpdatesSectionProps) {
  const defaultExpanded = updates.length <= 2;
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (updates.length === 0) return null;

  return (
    <section className="mb-4 px-4 pt-[14px]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-sage uppercase tracking-wide py-1.5"
        aria-expanded={expanded}
      >
        <span>Upcoming · {updates.length} scheduled</span>
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2">
          {updates.map((u, i) => {
            const raw = u as unknown as Partial<EnrichedUpdate>;
            const safeUpdate: EnrichedUpdate = {
              ...u,
              anon_name: raw.anon_name ?? null,
              update_type: raw.update_type ?? { id: '', name: 'Update', icon: '📝' } as EnrichedUpdate['update_type'],
              photos: raw.photos ?? [],
              species: raw.species ?? [],
              fields: raw.fields ?? [],
              createdByProfile: raw.createdByProfile ?? null,
            } as EnrichedUpdate;
            return (
              <RailCard
                key={u.id}
                update={safeUpdate}
                onOpen={() => onUpdateTap(u)}
                isLast={i === updates.length - 1}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
