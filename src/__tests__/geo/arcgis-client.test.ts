import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchArcGISHub,
  fetchFeatureServerFields,
  queryParcelsByPoint,
  queryParcelsByEnvelope,
} from '@/lib/geo/arcgis-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('searchArcGISHub', () => {
  it('returns matching feature service URLs from first successful query', async () => {
    // First query returns a parcel result — stops early since we have enough
    const hubResponse = {
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Tax Parcel Polygons',
            url: 'https://services6.arcgis.com/abc/arcgis/rest/services/Tax_Parcels/FeatureServer',
            type: 'Feature Service',
          },
          {
            title: 'Zoning Districts',
            url: 'https://services6.arcgis.com/abc/arcgis/rest/services/Zoning/FeatureServer',
            type: 'Feature Service',
          },
        ],
      }),
    };
    // Mock enough responses for the multi-query approach
    mockFetch.mockResolvedValue(hubResponse);

    const results = await searchArcGISHub('Kitsap', 'WA');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toBe('Tax Parcel Polygons');
  });

  it('deduplicates results across multiple queries', async () => {
    const sameResult = {
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Tax Parcels',
            url: 'https://example.com/Parcels/FeatureServer',
          },
        ],
      }),
    };
    mockFetch.mockResolvedValue(sameResult);

    const results = await searchArcGISHub('Test', 'WA');
    // Same URL returned by multiple queries should be deduplicated
    expect(results.length).toBe(1);
  });

  it('returns empty array when all queries error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const results = await searchArcGISHub('Test', 'WA');
    expect(results).toEqual([]);
  });
});

describe('fetchFeatureServerFields', () => {
  it('returns field names from FeatureServer metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields: [
          { name: 'APN', type: 'esriFieldTypeString' },
          { name: 'OWNER', type: 'esriFieldTypeString' },
          { name: 'Shape', type: 'esriFieldTypeGeometry' },
        ],
        geometryType: 'esriGeometryPolygon',
      }),
    });

    const result = await fetchFeatureServerFields(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0'
    );
    expect(result?.fields).toEqual(['APN', 'OWNER', 'Shape']);
    expect(result?.geometryType).toBe('esriGeometryPolygon');
  });

  it('returns null on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const result = await fetchFeatureServerFields('https://bad-url');
    expect(result).toBeNull();
  });
});

describe('queryParcelsByPoint', () => {
  it('returns GeoJSON features for a point query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { APN: '1311562', POLY_ACRES: 2.96 },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-122.56, 47.63], [-122.55, 47.63], [-122.55, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
            },
          },
        ],
      }),
    });

    const features = await queryParcelsByPoint(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0',
      47.634,
      -122.555
    );
    expect(features.length).toBe(1);
    expect(features[0].properties?.APN).toBe('1311562');
  });

  it('returns empty array when no parcels found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [],
      }),
    });

    const features = await queryParcelsByPoint(
      'https://example.com/FeatureServer/0',
      0,
      0
    );
    expect(features).toEqual([]);
  });
});

describe('queryParcelsByEnvelope', () => {
  it('returns features within bounding box filtered by where clause', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { APN: '1311273', CONTACT_NAME: 'ROLLING BAY LAND COMPANY' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-122.56, 47.63], [-122.54, 47.63], [-122.54, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
            },
          },
        ],
      }),
    });

    const features = await queryParcelsByEnvelope(
      'https://services6.arcgis.com/abc/arcgis/rest/services/Parcels/FeatureServer/0',
      [-122.562, 47.628, -122.548, 47.640],
      "CONTACT_NAME LIKE '%ROLLING BAY%'"
    );
    expect(features.length).toBe(1);
  });
});
