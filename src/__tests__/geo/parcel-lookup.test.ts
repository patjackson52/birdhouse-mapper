import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runParcelLookup } from '@/lib/geo/parcel-lookup';

// Mock all dependencies
vi.mock('@/lib/geo/census-client', () => ({
  geocodeAddress: vi.fn(),
  resolveCountyFips: vi.fn(),
}));

vi.mock('@/lib/geo/arcgis-client', () => ({
  searchArcGISHub: vi.fn(),
  fetchFeatureServerFields: vi.fn(),
  queryParcelsByPoint: vi.fn(),
  queryParcelsByEnvelope: vi.fn(),
}));

vi.mock('@/lib/geo/field-matcher', () => ({
  matchFields: vi.fn(),
}));

import { geocodeAddress, resolveCountyFips } from '@/lib/geo/census-client';
import { searchArcGISHub, fetchFeatureServerFields, queryParcelsByPoint, queryParcelsByEnvelope } from '@/lib/geo/arcgis-client';
import { matchFields } from '@/lib/geo/field-matcher';

const mockGeocodeAddress = vi.mocked(geocodeAddress);
const mockResolveCountyFips = vi.mocked(resolveCountyFips);
const mockSearchArcGISHub = vi.mocked(searchArcGISHub);
const mockFetchFields = vi.mocked(fetchFeatureServerFields);
const mockQueryByPoint = vi.mocked(queryParcelsByPoint);
const mockQueryByEnvelope = vi.mocked(queryParcelsByEnvelope);
const mockMatchFields = vi.mocked(matchFields);

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_PARCEL_FEATURE: GeoJSON.Feature = {
  type: 'Feature',
  properties: { APN: '1311562', POLY_ACRES: 2.96, CONTACT_NAME: 'SMITH' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-122.56, 47.63], [-122.55, 47.63], [-122.55, 47.64], [-122.56, 47.64], [-122.56, 47.63]]],
  },
};

describe('runParcelLookup', () => {
  it('returns not_found when geocoding fails', async () => {
    mockGeocodeAddress.mockResolvedValueOnce(null);

    const result = await runParcelLookup({ address: 'bad address', registryLookup: async () => null, registrySave: async () => {} });
    expect(result.status).toBe('not_found');
    expect(result.error_message).toContain('geocode');
  });

  it('returns not_found when FIPS resolution fails', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce(null);

    const result = await runParcelLookup({ address: '123 Main St', registryLookup: async () => null, registrySave: async () => {} });
    expect(result.status).toBe('not_found');
    expect(result.error_message).toContain('county');
  });

  it('auto-discovers endpoint and returns found parcel', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockSearchArcGISHub.mockResolvedValueOnce([
      { title: 'Tax Parcels', url: 'https://example.com/Parcels/FeatureServer' },
    ]);
    mockFetchFields.mockResolvedValueOnce({
      fields: ['APN', 'CONTACT_NAME', 'POLY_ACRES', 'Shape'],
      geometryType: 'esriGeometryPolygon',
    });
    mockMatchFields.mockReturnValueOnce({
      field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
      confidence: 'high',
      matched_count: 3,
    });
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);
    mockQueryByEnvelope.mockResolvedValueOnce([]);

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => null,
      registrySave: async () => {},
    });

    expect(result.status).toBe('found');
    expect(result.parcels.length).toBe(1);
    expect(result.parcels[0].apn).toBe('1311562');
    expect(result.parcels[0].acres).toBe(2.96);
    expect(result.county_fips).toBe('53035');
  });

  it('uses cached registry entry when available', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);
    mockQueryByEnvelope.mockResolvedValueOnce([]);

    const cachedConfig = {
      id: 'test-id',
      fips: '53035',
      county_name: 'Kitsap',
      state: 'WA',
      parcel_layer_url: 'https://example.com/Parcels/FeatureServer/0',
      address_layer_url: null,
      field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
      discovery_method: 'auto' as const,
      confidence: 'high' as const,
      last_verified_at: null,
    };

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => cachedConfig,
      registrySave: async () => {},
    });

    expect(result.status).toBe('found');
    expect(mockSearchArcGISHub).not.toHaveBeenCalled();
  });

  it('returns multiple when adjacent same-owner parcels found', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockQueryByPoint.mockResolvedValueOnce([MOCK_PARCEL_FEATURE]);

    const adjacentFeature: GeoJSON.Feature = {
      type: 'Feature',
      properties: { APN: '1311273', POLY_ACRES: 19.89, CONTACT_NAME: 'SMITH' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-122.57, 47.63], [-122.55, 47.63], [-122.55, 47.65], [-122.57, 47.65], [-122.57, 47.63]]],
      },
    };
    mockQueryByEnvelope.mockResolvedValueOnce([MOCK_PARCEL_FEATURE, adjacentFeature]);

    const result = await runParcelLookup({
      address: '7550 Fletcher Bay Rd',
      registryLookup: async () => ({
        id: 'test',
        fips: '53035',
        county_name: 'Kitsap',
        state: 'WA',
        parcel_layer_url: 'https://example.com/Parcels/FeatureServer/0',
        address_layer_url: null,
        field_map: { parcel_id: 'APN', owner_name: 'CONTACT_NAME', acres: 'POLY_ACRES' },
        discovery_method: 'auto' as const,
        confidence: 'high' as const,
        last_verified_at: null,
      }),
      registrySave: async () => {},
    });

    expect(result.status).toBe('multiple');
    expect(result.parcels.length).toBe(2);
  });

  it('returns not_found when discovery finds no parcel layers', async () => {
    mockGeocodeAddress.mockResolvedValueOnce({ lat: 47.634, lng: -122.555, matchedAddress: 'test' });
    mockResolveCountyFips.mockResolvedValueOnce({ fips: '53035', county_name: 'Kitsap', state_fips: '53' });
    mockSearchArcGISHub.mockResolvedValueOnce([]);

    const result = await runParcelLookup({
      address: '123 Main St',
      registryLookup: async () => null,
      registrySave: async () => {},
    });

    expect(result.status).toBe('not_found');
  });
});
