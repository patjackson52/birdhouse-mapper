'use client';

import { useState } from 'react';
import type { EnrichedUpdate } from '@/lib/types';
import { RailCard } from './RailCard';
import { UpdateDetailSheet } from './UpdateDetailSheet';
import { AllUpdatesSheet } from './AllUpdatesSheet';
import ScheduledUpdatesSection from './ScheduledUpdatesSection';
import { partitionScheduled } from './timeline-helpers';
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

export function TimelineRail({
  updates,
  maxItems,
  showScheduled = true,
  canAddUpdate,
  currentUserId,
  userRole,
  onAddUpdate,
  onDeleteUpdate,
}: {
  updates: EnrichedUpdate[];
  maxItems?: number;
  showScheduled?: boolean;
  canAddUpdate: boolean;
  currentUserId: string | null;
  userRole: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null;
  onAddUpdate?: () => void;
  onDeleteUpdate: (id: string, permission: DeletePermission) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

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
        currentUserId={currentUserId}
        deletePermission={computeDeletePermission(open, currentUserId, userRole)}
        onRequestDelete={(u, perm) => {
          setOpenId(null);
          onDeleteUpdate(u.id, perm);
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

function computeDeletePermission(
  update: EnrichedUpdate | null,
  currentUserId: string | null,
  role: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null
): DeletePermission | null {
  if (!update || !currentUserId) return null;
  if (role === 'admin' || role === 'coordinator') return { kind: 'admin' };
  const isAnon = !update.created_by || update.anon_name != null;
  if (!isAnon && update.created_by === currentUserId) return { kind: 'author' };
  return null;
}
