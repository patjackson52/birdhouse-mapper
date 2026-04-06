'use client';

import { useState } from 'react';
import type { ItemType, ItemStatus } from '@/lib/types';
import { statusColors, statusLabels } from '@/lib/utils';

interface MapLegendProps {
  itemTypes: ItemType[];
  legendConfig?: {
    statuses?: string[];
    itemTypeIds?: string[];
  };
}

export default function MapLegend({ itemTypes, legendConfig }: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  const allStatuses: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];
  const visibleStatuses = legendConfig?.statuses
    ? allStatuses.filter((s) => legendConfig.statuses!.includes(s))
    : allStatuses.filter((s) => s !== 'removed');

  const statusItems = visibleStatuses.map((s) => ({
    color: statusColors[s],
    label: statusLabels[s],
  }));

  const visibleTypes = legendConfig?.itemTypeIds
    ? itemTypes.filter((t) => legendConfig.itemTypeIds!.includes(t.id))
    : itemTypes;

  return (
    <div className="absolute bottom-20 md:bottom-6 left-4 z-10">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="bg-white rounded-lg shadow-lg border border-sage-light p-2 text-forest-dark hover:bg-sage-light transition-colors"
          title="Show legend"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </button>
      ) : (
        <div className="bg-white backdrop-blur-sm rounded-lg shadow-lg border border-sage-light px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider">
              Legend
            </h4>
            <button
              onClick={() => setCollapsed(true)}
              className="text-sage hover:text-forest-dark transition-colors -mr-1"
              title="Hide legend"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
          {visibleTypes.length > 1 && (
            <>
              <h4 className="text-[10px] font-medium text-sage uppercase tracking-wider mt-2 mb-1.5">
                Types
              </h4>
              <div className="space-y-1">
                {visibleTypes.map((type) => (
                  <div key={type.id} className="flex items-center gap-2">
                    <span className="text-sm">{type.icon}</span>
                    <span className="text-xs text-forest-dark">{type.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
