'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center">
      <h1 className="font-heading text-forest-dark text-lg mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-600 mb-4">{error.message}</p>
      <button onClick={reset} className="btn-secondary">Retry</button>
    </div>
  );
}
