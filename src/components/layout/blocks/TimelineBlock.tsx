import type { EnrichedUpdate, UpdateTypeField } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import { TimelineRail } from '@/components/item/timeline/TimelineRail';
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

interface TimelineBlockProps {
  config: TimelineConfig;
  updates: EnrichedUpdate[];
  updateTypeFields: UpdateTypeField[];
  canEditUpdate: boolean;
  canDeleteUpdate: boolean;
  currentUserId?: string | null;
  userRole?: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null;
  onDeleteUpdate?: (updateId: string, permission: DeletePermission) => void;
  onEditUpdate?: (updateId: string) => void;
}

export default function TimelineBlock({
  config,
  updates,
  currentUserId,
  userRole,
  onDeleteUpdate,
}: TimelineBlockProps) {
  if (!config.showUpdates) return null;

  return (
    <TimelineRail
      updates={updates}
      maxItems={config.maxItems}
      showScheduled={config.showScheduled}
      canAddUpdate={false}
      currentUserId={currentUserId ?? null}
      userRole={userRole ?? null}
      onDeleteUpdate={(id, permission) => {
        onDeleteUpdate?.(id, permission);
      }}
    />
  );
}
