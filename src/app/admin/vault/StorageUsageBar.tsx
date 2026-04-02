'use client';

interface StorageUsageBarProps {
  currentBytes: number;
  maxBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageUsageBar({ currentBytes, maxBytes }: StorageUsageBarProps) {
  const pct = maxBytes > 0 ? (currentBytes / maxBytes) * 100 : 0;
  const clampedPct = Math.min(pct, 100);

  let colorClass = 'bg-green-500';
  if (pct >= 90) colorClass = 'bg-red-500';
  else if (pct >= 75) colorClass = 'bg-yellow-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-forest-dark">Data Vault</span>
        <span className="text-sage">
          {formatBytes(currentBytes)} of {formatBytes(maxBytes)} used
        </span>
      </div>
      <div className="h-2 bg-sage-light rounded-full overflow-hidden">
        <div
          data-testid="usage-fill"
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      {pct >= 90 && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          Approaching storage limit. Consider deleting unused files or upgrading your plan.
        </div>
      )}
    </div>
  );
}
