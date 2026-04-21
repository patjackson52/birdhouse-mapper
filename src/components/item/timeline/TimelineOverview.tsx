'use client';

/**
 * @deprecated TimelineOverview is a transitional wrapper kept only so
 * TimelineBlock and DetailPanel keep compiling during the v2 timeline
 * migration. Task 17 deletes this file and points its callers at
 * TimelineRail directly. Do not extend this.
 */

import type { UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from './timeline-helpers';
import { TimelineRail } from './TimelineRail';

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
  config,
  onDeleteUpdate,
}: TimelineOverviewProps) {
  if (!config.showUpdates) return null;

  return (
    <TimelineRail
      updates={updates as any}
      maxItems={config.maxItems}
      showScheduled={config.showScheduled}
      canAddUpdate={false}
      onDeleteUpdate={(id) => {
        if (onDeleteUpdate) void onDeleteUpdate(id);
      }}
    />
  );
}
