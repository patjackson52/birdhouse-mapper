import type { ItemStatus } from '@/lib/types';
import { statusLabels } from '@/lib/utils';

const badgeStyles: Record<ItemStatus, string> = {
  active: 'bg-sage-light text-forest border-sage-light',
  planned: 'bg-gray-100 text-gray-600 border-gray-200',
  damaged: 'bg-amber-50 text-amber-700 border-amber-200',
  removed: 'bg-gray-100 text-gray-500 border-gray-200',
};

interface StatusBadgeProps {
  status: ItemStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeStyles[status]}`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          status === 'active'
            ? 'bg-forest'
            : status === 'planned'
            ? 'bg-gray-400'
            : status === 'damaged'
            ? 'bg-amber-500'
            : 'bg-gray-400'
        }`}
      />
      {statusLabels[status]}
    </span>
  );
}
