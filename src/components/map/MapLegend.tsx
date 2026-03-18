import type { ItemType } from '@/lib/types';
import { statusColors } from '@/lib/utils';

interface MapLegendProps {
  itemTypes: ItemType[];
}

export default function MapLegend({ itemTypes }: MapLegendProps) {
  // Status legend
  const statusItems = [
    { color: statusColors.active, label: 'Active' },
    { color: statusColors.planned, label: 'Planned' },
    { color: statusColors.damaged, label: 'Needs Repair' },
  ];

  return (
    <div className="absolute bottom-20 md:bottom-6 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-sage-light/60 px-3 py-2.5">
      <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mb-1.5">
        Status
      </h4>
      <div className="space-y-1">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-forest-dark">{item.label}</span>
          </div>
        ))}
      </div>
      {itemTypes.length > 1 && (
        <>
          <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mt-2 mb-1.5">
            Types
          </h4>
          <div className="space-y-1">
            {itemTypes.map((type) => (
              <div key={type.id} className="flex items-center gap-2">
                <span className="text-sm">{type.icon}</span>
                <span className="text-xs text-forest-dark">{type.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
