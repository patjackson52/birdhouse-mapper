import type { MaintenanceStatus } from '@/lib/maintenance/types';

const STYLE: Record<MaintenanceStatus, { label: string; bg: string; fg: string }> = {
  planned:     { label: 'Planned',     bg: 'bg-amber-100',  fg: 'text-amber-800' },
  in_progress: { label: 'In progress', bg: 'bg-blue-100',   fg: 'text-blue-800'  },
  completed:   { label: 'Completed',   bg: 'bg-green-100',  fg: 'text-green-800' },
  cancelled:   { label: 'Cancelled',   bg: 'bg-gray-100',   fg: 'text-gray-700'  },
};

interface Props {
  status: MaintenanceStatus;
  size?: 'sm' | 'md';
}

export function MaintenanceStatusPill({ status, size = 'md' }: Props) {
  const style = STYLE[status];
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      aria-label={`Status: ${style.label}`}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${style.bg} ${style.fg}`}
    >
      {style.label}
    </span>
  );
}
