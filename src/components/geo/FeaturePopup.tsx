'use client';

import type { Feature } from 'geojson';

interface FeaturePopupProps {
  feature: Feature;
  layerName: string;
  onClose: () => void;
}

export default function FeaturePopup({ feature, layerName, onClose }: FeaturePopupProps) {
  const properties = feature.properties ?? {};
  const entries = Object.entries(properties).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto md:fixed md:bottom-auto md:left-auto md:right-4 md:top-4 md:rounded-2xl md:w-80 md:max-h-[80vh]">
      <div className="flex justify-center pt-2 md:hidden">
        <div className="w-8 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-forest-dark text-sm">{layerName}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No attributes</p>
        ) : (
          <dl className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">{key}</dt>
                <dd className="text-sm text-gray-800">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
