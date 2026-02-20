export default function MapLegend() {
  const items = [
    { color: '#5D7F3A', label: 'Active' },
    { color: '#9CA3AF', label: 'Planned' },
    { color: '#D97706', label: 'Needs Repair' },
  ];

  return (
    <div className="absolute bottom-20 md:bottom-6 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-sage-light/60 px-3 py-2.5">
      <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mb-1.5">
        Legend
      </h4>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-forest-dark">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
