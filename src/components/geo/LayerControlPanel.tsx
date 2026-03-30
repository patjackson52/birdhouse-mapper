'use client';

import { useState } from 'react';
import type { GeoLayerSummary } from '@/lib/geo/types';

interface LayerControlPanelProps {
  layers: GeoLayerSummary[];
  visibleLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
}

export default function LayerControlPanel({ layers, visibleLayerIds, onToggleLayer }: LayerControlPanelProps) {
  const [open, setOpen] = useState(false);

  if (layers.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-3 right-3 z-[1000] bg-white rounded-lg shadow-lg border border-sage-light p-3 min-w-[44px] min-h-[44px] text-forest-dark hover:bg-sage-light transition-colors"
        aria-label="Toggle layers"
        title="Geo Layers"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-16 right-3 z-[1000] bg-white rounded-xl shadow-xl border border-sage-light w-64 max-h-[50vh] overflow-y-auto md:w-72">
          <div className="p-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-forest-dark">Layers</h3>
          </div>
          <div className="p-2">
            {layers.map((layer) => (
              <label
                key={layer.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer min-h-[44px]"
              >
                <input
                  type="checkbox"
                  checked={visibleLayerIds.has(layer.id)}
                  onChange={() => onToggleLayer(layer.id)}
                  className="w-4 h-4 rounded accent-current"
                  style={{ accentColor: layer.color }}
                />
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{layer.name}</div>
                  <div className="text-xs text-gray-500">{layer.feature_count} features</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
