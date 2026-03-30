import { describe, it, expect } from 'vitest';
import { filterItemsByBoundary, clipLayerToBoundary } from '@/lib/geo/spatial';
import type { FeatureCollection } from 'geojson';

const boundary: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-71, 43], [-71, 44], [-70, 44], [-70, 43], [-71, 43]]],
    },
    properties: {},
  }],
};

describe('filterItemsByBoundary', () => {
  it('keeps items inside the boundary', () => {
    const items = [
      { id: '1', latitude: 43.5, longitude: -70.5 },
      { id: '2', latitude: 45.0, longitude: -70.5 }, // outside
      { id: '3', latitude: 43.8, longitude: -70.2 },
    ];
    const result = filterItemsByBoundary(items, boundary);
    expect(result.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('returns all items if boundary has no polygon features', () => {
    const emptyBoundary: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const items = [{ id: '1', latitude: 43.5, longitude: -70.5 }];
    const result = filterItemsByBoundary(items, emptyBoundary);
    expect(result).toHaveLength(1);
  });
});

describe('clipLayerToBoundary', () => {
  it('clips polygon features to the boundary', () => {
    const layer: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-70.5, 43.5], [-70.5, 44.5], [-69.5, 44.5], [-69.5, 43.5], [-70.5, 43.5]]],
        },
        properties: { zone: 'test' },
      }],
    };
    const result = clipLayerToBoundary(layer, boundary);
    expect(result.features.length).toBeGreaterThanOrEqual(1);
    expect(result.features[0].properties?.zone).toBe('test');
  });

  it('passes through point features inside the boundary', () => {
    const layer: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-70.5, 43.5] }, properties: { name: 'inside' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-68, 43.5] }, properties: { name: 'outside' } },
      ],
    };
    const result = clipLayerToBoundary(layer, boundary);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.name).toBe('inside');
  });
});
