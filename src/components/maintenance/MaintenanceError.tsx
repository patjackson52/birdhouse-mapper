'use client';

interface Props {
  message?: string;
  onRetry: () => void;
}

export function MaintenanceError({ message, onRetry }: Props) {
  return (
    <div className="card p-6 text-center">
      <div className="text-red-800 font-semibold text-[15px] mb-2">Something went wrong</div>
      {message && <div className="text-[13px] text-gray-600 mb-4">{message}</div>}
      <button onClick={onRetry} className="btn-secondary">Retry</button>
    </div>
  );
}
