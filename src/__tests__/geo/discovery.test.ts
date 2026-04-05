import { describe, it, expect } from 'vitest';
import { bboxOverlaps, intersectFeaturesWithArea, injectProvenance } from '@/lib/geo/discovery';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

function bboxToPolygon(bbox: [number, number, number, number]): Feature<Polygon> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

function makeFC(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('bboxOverlaps', () => {
  it('returns true for overlapping bboxes', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-70.5, 43.5, -69.5, 44.5];
    expect(bboxOverlaps(a, b)).toBe(true);
  });

  it('returns false for non-overlapping bboxes', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-69, 45, -68, 46];
    expect(bboxOverlaps(a, b)).toBe(false);
  });

  it('returns true for touching bboxes (shared edge)', () => {
    const a: [number, number, number, number] = [-71, 43, -70, 44];
    const b: [number, number, number, number] = [-70, 44, -69, 45];
    expect(bboxOverlaps(a, b)).toBe(true);
  });

  it('returns true when one bbox is fully inside the other', () => {
    const outer: [number, number, number, number] = [-72, 42, -68, 46];
    const inner: [number, number, number, number] = [-71, 43, -69, 45];
    expect(bboxOverlaps(outer, inner)).toBe(true);
    expect(bboxOverlaps(inner, outer)).toBe(true);
  });
});

describe('intersectFeaturesWithArea', () => {
  const searchArea = bboxToPolygon([-71, 43, -70, 44]);

  it('includes points inside the search area', () => {
    const point: Feature = {
      type: 'Feature',
      properties: { name: 'Inside Point' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const fc = makeFC([point]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('Inside Point');
  });

  it('excludes points outside the search area', () => {
    const point: Feature = {
      type: 'Feature',
      properties: { name: 'Outside Point' },
      geometry: { type: 'Point', coordinates: [-68, 46] },
    };
    const fc = makeFC([point]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(0);
  });

  it('clips polygons to the search area', () => {
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: { name: 'Partial Polygon' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-70.5, 43.5],
          [-69.5, 43.5],
          [-69.5, 44.5],
          [-70.5, 44.5],
          [-70.5, 43.5],
        ]],
      },
    };
    const fc = makeFC([polygon]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('Partial Polygon');
  });

  it('excludes polygons fully outside the search area', () => {
    const polygon: Feature<Polygon> = {
      type: 'Feature',
      properties: { name: 'Far Away' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-60, 50], [-59, 50], [-59, 51], [-60, 51], [-60, 50]]],
      },
    };
    const fc = makeFC([polygon]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(0);
  });

  it('includes lines with at least one vertex inside the search area', () => {
    const line: Feature = {
      type: 'Feature',
      properties: { name: 'Crossing Line' },
      geometry: {
        type: 'LineString',
        coordinates: [[-70.5, 43.5], [-69.5, 44.5]],
      },
    };
    const fc = makeFC([line]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
  });

  it('handles mixed geometry types', () => {
    const inside: Feature = {
      type: 'Feature',
      properties: { name: 'In' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const outside: Feature = {
      type: 'Feature',
      properties: { name: 'Out' },
      geometry: { type: 'Point', coordinates: [-68, 46] },
    };
    const fc = makeFC([inside, outside]);
    const result = intersectFeaturesWithArea(fc, searchArea);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.name).toBe('In');
  });
});

describe('injectProvenance', () => {
  it('adds _source_layer_id and _source_layer_name to feature properties', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { name: 'Trail A' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const result = injectProvenance(feature, 'layer-123', 'Parks Department');
    expect(result.properties?._source_layer_id).toBe('layer-123');
    expect(result.properties?._source_layer_name).toBe('Parks Department');
    expect(result.properties?.name).toBe('Trail A');
  });

  it('does not mutate the original feature', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: { name: 'Original' },
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const result = injectProvenance(feature, 'layer-1', 'Source');
    expect(feature.properties?._source_layer_id).toBeUndefined();
    expect(result).not.toBe(feature);
  });

  it('handles features with null properties', () => {
    const feature: Feature = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
    };
    const result = injectProvenance(feature, 'layer-1', 'Source');
    expect(result.properties?._source_layer_id).toBe('layer-1');
  });
});
