export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-7 bg-sage-light rounded w-1/3 mb-5" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="card h-16" />
        <div className="card h-16" />
        <div className="card h-16" />
        <div className="card h-16" />
      </div>
      <div className="card h-64" />
    </div>
  );
}
