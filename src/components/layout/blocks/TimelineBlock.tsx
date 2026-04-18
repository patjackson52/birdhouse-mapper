import type { UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import type { TimelineUpdate } from '@/components/item/timeline/timeline-helpers';
import TimelineOverview from '@/components/item/timeline/TimelineOverview';

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
  updateTypeFields,
  canEditUpdate,
  canDeleteUpdate,
  onDeleteUpdate,
  onEditUpdate,
}: TimelineBlockProps) {
  if (!config.showUpdates) return null;

  return (
    <TimelineOverview
      updates={updates}
      updateTypeFields={updateTypeFields}
      config={config}
      canEditUpdate={canEditUpdate}
      canDeleteUpdate={canDeleteUpdate}
      onDeleteUpdate={onDeleteUpdate}
      onEditUpdate={onEditUpdate}
    />
  );
}
