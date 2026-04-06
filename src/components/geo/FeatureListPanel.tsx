'use client';

import { useState } from 'react';
import type { FeatureGroup, DiscoveredFeature } from '@/lib/geo/types';

interface FeatureListPanelProps {
  groups: FeatureGroup[];
  selectedIds: Set<string>;
  onToggleFeature: (featureKey: string) => void;
  onToggleGroup: (layerId: string, selectAll: boolean) => void;
}

/** Stable key for a discovered feature: sourceLayerId + feature index within that group */
export function featureKey(layerId: string, index: number): string {
  return `${layerId}::${index}`;
}

function getFeatureName(feature: GeoJSON.Feature, index: number): string {
  const props = feature.properties;
  if (props?.name) return props.name;
  if (props?.NAME) return props.NAME;
  if (props?.title) return props.title;
  return `${feature.geometry.type} #${index + 1}`;
}

function geometryIcon(type: string): string {
  switch (type) {
    case 'Point':
    case 'MultiPoint':
      return '\u25CF'; // ●
    case 'LineString':
    case 'MultiLineString':
      return '\u2500'; // ─
    case 'Polygon':
    case 'MultiPolygon':
      return '\u25A0'; // ■
    default:
      return '\u25CB'; // ○
  }
}

export default function FeatureListPanel({
  groups,
  selectedIds,
  onToggleFeature,
  onToggleGroup,
}: FeatureListPanelProps) {
  const [filter, setFilter] = useState('');
  const totalSelected = selectedIds.size;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-700">
          {totalSelected} feature{totalSelected !== 1 ? 's' : ''} selected
        </div>
        <input
          type="text"
          placeholder="Filter features..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input-field mt-2 text-sm"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const groupKeys = group.features.map((_, i) => featureKey(group.layerId, i));
          const allSelected = groupKeys.every((k) => selectedIds.has(k));
          const someSelected = groupKeys.some((k) => selectedIds.has(k));

          return (
            <div key={group.layerId}>
              {/* Group header — sticky */}
              <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.layerColor }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{group.layerName}</div>
                    <div className="text-xs text-gray-500">
                      {group.sourceFormat.toUpperCase()} · {group.features.length} features
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onToggleGroup(group.layerId, !allSelected)}
                  className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap ml-2"
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Feature rows */}
              {group.features.map((df, i) => {
                const key = featureKey(group.layerId, i);
                const name = getFeatureName(df.feature, i);
                const matchesFilter = !filter || name.toLowerCase().includes(filter.toLowerCase());
                if (!matchesFilter) return null;

                const isSelected = selectedIds.has(key);

                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                    style={isSelected ? { borderLeft: `3px solid ${group.layerColor}` } : { borderLeft: '3px solid transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleFeature(key)}
                      className="w-4 h-4 rounded flex-shrink-0"
                      style={{ accentColor: group.layerColor }}
                    />
                    <span className="text-gray-400 text-xs flex-shrink-0">
                      {geometryIcon(df.feature.geometry.type)}
                    </span>
                    <span className="text-sm text-gray-700 truncate">{name}</span>
                    {df.duplicateSources && df.duplicateSources.length > 0 && (
                      <span
                        className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0"
                        title={`Also in: ${df.duplicateSources.map((s) => s.layerName).join(', ')}`}
                      >
                        {df.duplicateSources.length + 1} layers
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
