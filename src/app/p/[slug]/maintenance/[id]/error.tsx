'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="bg-parchment min-h-screen flex items-center justify-center p-6">
      <div className="card p-6 text-center max-w-md">
        <h1 className="font-heading text-forest-dark text-lg mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-600 mb-4">{error.message}</p>
        <button onClick={reset} className="btn-secondary">
          Retry
        </button>
      </div>
    </div>
  );
}
