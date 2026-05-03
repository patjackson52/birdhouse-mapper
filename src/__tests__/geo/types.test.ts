import { describe, it, expect } from 'vitest';
import type { GeoLayer, GeoLayerSummary, GeoLayerStatus, GeoLayerSource } from '@/lib/geo/types';

describe('geo layer types', () => {
  it('GeoLayer includes status and source fields', () => {
    const layer: GeoLayer = {
      id: '1',
      org_id: '2',
      name: 'Test',
      description: null,
      color: '#3b82f6',
      opacity: 0.6,
      source_format: 'geojson',
      source_filename: 'test.geojson',
      geojson: { type: 'FeatureCollection', features: [] },
      feature_count: 0,
      bbox: null,
      is_property_boundary: false,
      created_at: '2026-01-01',
      updated_at: '2026-05-03T00:00:00Z',
      created_by: null,
      status: 'draft',
      source: 'manual',
    };
    expect(layer.status).toBe('draft');
    expect(layer.source).toBe('manual');
  });
});
