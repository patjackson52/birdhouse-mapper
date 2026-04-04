import type { ItemUpdate } from '@/lib/types';
import type { TimelineConfig } from '@/lib/layout/types';
import UpdateTimeline from '@/components/item/UpdateTimeline';

interface TimelineBlockProps {
  config: TimelineConfig;
  updates: ItemUpdate[];
}

export default function TimelineBlock({ config, updates }: TimelineBlockProps) {
  if (!config.showUpdates) return null;

  const limited = updates.slice(0, config.maxItems);

  if (limited.length === 0) {
    return <p className="text-sm text-sage italic">No activity yet</p>;
  }

  return <UpdateTimeline updates={limited} />;
}
