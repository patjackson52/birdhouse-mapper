'use client';

import { useState } from 'react';
import type { EnrichedUpdate } from '@/lib/types';
import { RailCard } from './RailCard';
import { UpdateDetailSheet } from './UpdateDetailSheet';
import { AllUpdatesSheet } from './AllUpdatesSheet';
import ScheduledUpdatesSection from './ScheduledUpdatesSection';
import { partitionScheduled } from './timeline-helpers';

export function TimelineRail({
  updates,
  maxItems,
  showScheduled = true,
  canAddUpdate,
  onAddUpdate,
  onDeleteUpdate,
}: {
  updates: EnrichedUpdate[];
  maxItems?: number;
  showScheduled?: boolean;
  canAddUpdate: boolean;
  onAddUpdate?: () => void;
  onDeleteUpdate: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [speciesOpenExternalId, setSpeciesOpenExternalId] = useState<number | null>(null);

  const { scheduled, past } = partitionScheduled(updates as any);
  const cap = maxItems ?? past.length;
  const capped = past.slice(0, cap);
  const hasMore = past.length > cap;

  const open = updates.find((u) => u.id === openId) ?? null;

  return (
    <div className="pb-24">
      {showScheduled && scheduled.length > 0 && (
        <ScheduledUpdatesSection
          updates={scheduled as any}
          updateTypeFields={[]}
          onUpdateTap={(u: any) => setOpenId(u.id)}
        />
      )}
      <div className="px-4 pt-[14px]">
        {capped.map((u, i) => (
          <RailCard
            key={u.id}
            update={u as unknown as EnrichedUpdate}
            onOpen={() => setOpenId(u.id)}
            isLast={i === capped.length - 1}
          />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="mt-3 w-full rounded-xl border border-forest-border-soft bg-white px-4 py-2 text-sm font-medium text-forest-dark"
          >
            View all {past.length} updates
          </button>
        )}
      </div>
      <UpdateDetailSheet
        update={open}
        onClose={() => setOpenId(null)}
        onSpeciesOpen={(externalId) => setSpeciesOpenExternalId(externalId)}
        canEdit={false}
        canDelete={false}
        onDelete={() => {
          if (open) onDeleteUpdate(open.id);
          setOpenId(null);
        }}
      />
      {allOpen && (
        <AllUpdatesSheet
          updates={past as unknown as EnrichedUpdate[]}
          onClose={() => setAllOpen(false)}
          onOpen={(u) => {
            setAllOpen(false);
            setOpenId(u.id);
          }}
        />
      )}
    </div>
  );
}
