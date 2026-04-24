'use client';

import { MaintenanceError } from '@/components/maintenance/MaintenanceError';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <MaintenanceError message={error.message} onRetry={reset} />
    </div>
  );
}
