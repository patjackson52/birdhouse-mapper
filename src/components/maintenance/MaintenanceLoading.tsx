export function MaintenanceLoading() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-16" />
        ))}
      </div>
      <div className="card p-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[72px] border-b border-sage-light/50 last:border-b-0 px-5 py-4">
            <div className="h-4 bg-sage-light rounded w-1/3 mb-2" />
            <div className="h-3 bg-sage-light/60 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
