import type { EnrichedUpdate, UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from '@/components/item/timeline/timeline-helpers';
import { TimelineRail } from '@/components/item/timeline/TimelineRail';

interface TimelineBlockProps {
  config: TimelineConfig;
  updates: TimelineUpdate[];
  updateTypeFields: UpdateTypeField[];
  canEditUpdate: boolean;
  canDeleteUpdate: boolean;
  onDeleteUpdate?: (updateId: string) => void | Promise<void>;
  onEditUpdate?: (updateId: string) => void;
}

export default function TimelineBlock({
  config,
  updates,
  onDeleteUpdate,
}: TimelineBlockProps) {
  if (!config.showUpdates) return null;

  return (
    <TimelineRail
      updates={updates as unknown as EnrichedUpdate[]}
      maxItems={config.maxItems}
      showScheduled={config.showScheduled}
      canAddUpdate={false}
      onDeleteUpdate={(id) => {
        if (onDeleteUpdate) void onDeleteUpdate(id);
      }}
    />
  );
}
