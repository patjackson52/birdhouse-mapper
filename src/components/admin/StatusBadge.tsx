'use client';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  setup: 'bg-amber-100 text-amber-800',
  archived: 'bg-gray-100 text-gray-600',
  verifying: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  disabled: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-800',
  revoked: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
