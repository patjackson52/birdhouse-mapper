export default function Loading() {
  return (
    <div className="bg-parchment min-h-screen">
      <div className="bg-white border-b border-sage-light">
        <div className="max-w-3xl mx-auto px-4 md:px-10 py-3.5 h-12 animate-pulse">
          <div className="h-4 bg-sage-light rounded w-1/3" />
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-4 animate-pulse">
        <div className="h-6 bg-sage-light rounded w-1/2" />
        <div className="h-10 bg-sage-light rounded w-3/4" />
        <div className="h-4 bg-sage-light rounded w-full" />
        <div className="h-4 bg-sage-light rounded w-5/6" />
        <div className="card h-20" />
        <div className="card h-32" />
      </div>
    </div>
  );
}
