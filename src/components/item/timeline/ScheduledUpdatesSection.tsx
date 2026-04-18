'use client';

import { useState } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineUpdate } from './timeline-helpers';
import UpdateCard from './UpdateCard';

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
  updateTypeFields,
  onUpdateTap,
  showPhotos,
  showFieldValues,
  showEntityChips,
}: ScheduledUpdatesSectionProps) {
  const defaultExpanded = updates.length <= 2;
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (updates.length === 0) return null;

  return (
    <section className="mb-4">
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
        <div className="space-y-2 mt-2">
          {updates.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => onUpdateTap(u)}
              isScheduled
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      )}
    </section>
  );
}
