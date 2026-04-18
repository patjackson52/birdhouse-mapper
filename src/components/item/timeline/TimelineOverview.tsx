'use client';

import { useState } from 'react';
import type { UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from './timeline-helpers';
import { partitionScheduled } from './timeline-helpers';
import UpdateCard from './UpdateCard';
import ScheduledUpdatesSection from './ScheduledUpdatesSection';
import UpdateDetailSheet from './UpdateDetailSheet';
import AllUpdatesSheet from './AllUpdatesSheet';

interface TimelineOverviewProps {
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  config: TimelineConfig;
  canEditUpdate: boolean;
  canDeleteUpdate: boolean;
  onDeleteUpdate?: (updateId: string) => void | Promise<void>;
  onEditUpdate?: (updateId: string) => void;
}

export default function TimelineOverview({
  updates,
  updateTypeFields,
  config,
  canEditUpdate,
  canDeleteUpdate,
  onDeleteUpdate,
  onEditUpdate,
}: TimelineOverviewProps) {
  const [detailUpdateId, setDetailUpdateId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const { scheduled, past } = partitionScheduled(updates);
  const visible = past.slice(0, config.maxItems);
  const showViewAll = past.length > config.maxItems;
  const detailUpdate = detailUpdateId
    ? updates.find((u) => u.id === detailUpdateId) ?? null
    : null;

  const showPhotos = config.showPhotos;
  const showFieldValues = config.showFieldValues;
  const showEntityChips = config.showEntityChips;

  const openDetail = (u: TimelineUpdate) => setDetailUpdateId(u.id);
  const closeDetail = () => setDetailUpdateId(null);

  const empty = scheduled.length === 0 && past.length === 0;

  return (
    <div>
      {empty && (
        <p className="text-sm text-sage italic">No activity yet</p>
      )}

      {config.showScheduled && scheduled.length > 0 && (
        <ScheduledUpdatesSection
          updates={scheduled}
          updateTypeFields={updateTypeFields}
          onUpdateTap={openDetail}
          showPhotos={showPhotos}
          showFieldValues={showFieldValues}
          showEntityChips={showEntityChips}
        />
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((u) => (
            <UpdateCard
              key={u.id}
              update={u}
              updateTypeFields={updateTypeFields}
              onTap={() => openDetail(u)}
              showPhotos={showPhotos}
              showFieldValues={showFieldValues}
              showEntityChips={showEntityChips}
            />
          ))}
        </div>
      )}

      {showViewAll && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="mt-3 w-full text-sm font-medium text-forest hover:underline"
        >
          View all {past.length} updates
        </button>
      )}

      {detailUpdate && (
        <UpdateDetailSheet
          update={detailUpdate}
          updateTypeFields={updateTypeFields}
          isOpen={!!detailUpdate}
          onClose={closeDetail}
          canEdit={canEditUpdate}
          canDelete={canDeleteUpdate}
          onEdit={onEditUpdate ? () => onEditUpdate(detailUpdate.id) : undefined}
          onDelete={
            onDeleteUpdate
              ? async () => {
                  await onDeleteUpdate(detailUpdate.id);
                  closeDetail();
                }
              : undefined
          }
        />
      )}

      <AllUpdatesSheet
        updates={past}
        updateTypeFields={updateTypeFields}
        isOpen={allOpen}
        onClose={() => setAllOpen(false)}
        onUpdateTap={(u) => {
          openDetail(u);
        }}
        showPhotos={showPhotos}
        showFieldValues={showFieldValues}
        showEntityChips={showEntityChips}
      />
    </div>
  );
}
