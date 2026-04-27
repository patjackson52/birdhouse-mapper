import Link from 'next/link';
import { MaintenanceStatusPill } from './MaintenanceStatusPill';
import { classifyScheduled, computeProgress } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface Props {
  row: MaintenanceProjectRowData;
  today: string;
  detailHref: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MaintenanceProjectRow({ row, today, detailHref }: Props) {
  const schedule = classifyScheduled(row.scheduled_for, row.status, today);
  const progress = computeProgress(row.items_completed, row.items_total);

  return (
    <Link
      href={detailHref}
      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-5 py-4 border-b border-sage-light hover:bg-sage-light/20 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="font-heading text-forest-dark text-[15px] font-semibold truncate">
            {row.title}
          </span>
          <MaintenanceStatusPill status={row.status} size="sm" />
          {schedule.tone === 'overdue' && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 text-[11px] px-2 py-0.5 font-medium">
              Overdue
            </span>
          )}
          {schedule.tone === 'soon' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-medium">
              in {schedule.daysUntil}d
            </span>
          )}
        </div>
        <div className="text-[12px] text-gray-600 flex flex-wrap gap-3">
          <span>{formatDate(row.scheduled_for)}</span>
          <span>{row.items_total} items</span>
          {row.knowledge_count > 0 && (
            <span>{row.knowledge_count} article{row.knowledge_count > 1 ? 's' : ''}</span>
          )}
          {row.creator_name && <span className="opacity-70">by {row.creator_name}</span>}
        </div>
      </div>

      {row.status === 'in_progress' ? (
        <div className="w-[140px]">
          <div className="text-[11px] text-right text-gray-600 mb-1">
            {progress.completed}/{progress.total} done
          </div>
          <div className="h-1.5 rounded-full bg-sage-light overflow-hidden" data-testid="progress-bar">
            <div className="h-full bg-forest" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : (
        <div className="w-[140px]" />
      )}

      <div className="text-[11px] text-right w-[90px] text-gray-600">
        {row.status === 'completed' ? 'Completed' : 'Updated'}
        <br />
        <span className="text-forest-dark font-medium">{formatDate(row.updated_at.slice(0, 10))}</span>
      </div>

      <span aria-hidden className="text-sage">→</span>
    </Link>
  );
}
