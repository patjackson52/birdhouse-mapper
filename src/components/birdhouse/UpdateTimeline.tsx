import type { BirdhouseUpdate, Photo } from '@/lib/types';
import { formatShortDate, updateTypeLabels, updateTypeIcons } from '@/lib/utils';

interface UpdateTimelineProps {
  updates: (BirdhouseUpdate & { photos?: Photo[] })[];
}

export default function UpdateTimeline({ updates }: UpdateTimelineProps) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-sage italic">No updates yet.</p>
    );
  }

  const sorted = [...updates].sort(
    (a, b) => new Date(b.update_date).getTime() - new Date(a.update_date).getTime()
  );

  return (
    <div className="space-y-4">
      {sorted.map((update, index) => (
        <div key={update.id} className="relative pl-8">
          {/* Timeline line */}
          {index < sorted.length - 1 && (
            <div className="absolute left-3 top-8 bottom-0 w-px bg-sage-light" />
          )}
          {/* Timeline dot */}
          <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-sage-light text-sm">
            {updateTypeIcons[update.update_type]}
          </div>
          {/* Content */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-forest">
                {updateTypeLabels[update.update_type]}
              </span>
              <span className="text-xs text-sage">
                {formatShortDate(update.update_date)}
              </span>
            </div>
            {update.content && (
              <p className="text-sm text-forest-dark/80 leading-relaxed">
                {update.content}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
