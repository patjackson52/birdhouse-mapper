import type { ItemStatus } from '@/lib/types';
import StatusBadge from '@/components/item/StatusBadge';

interface StatusBadgeBlockProps {
  status: ItemStatus;
}

export default function StatusBadgeBlock({ status }: StatusBadgeBlockProps) {
  return <StatusBadge status={status} />;
}
