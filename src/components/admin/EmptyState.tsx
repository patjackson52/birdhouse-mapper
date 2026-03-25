'use client';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-12 border border-dashed border-sage-light rounded-lg">
      <p className="text-forest-dark font-medium mb-1">{title}</p>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary text-sm">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
