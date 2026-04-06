import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureCollection } from 'geojson';

let mockUser: any = { id: 'user-1' };
const mockFrom = vi.fn();

function mockQueryResult(resultFn: () => any) {
  const obj: any = {
    eq: vi.fn(() => obj),
    neq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    not: vi.fn(() => obj),
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => Promise.resolve(resultFn())),
    single: vi.fn(() => Promise.resolve(resultFn())),
    then: (resolve: any) => Promise.resolve(resultFn()).then(resolve),
  };
  return obj;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    from: mockFrom,
  }),
  createServiceClient: () => ({ from: mockFrom }),
}));

const sampleFC: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Test', _source_layer_id: 'src-1', _source_layer_name: 'Source Layer' },
    geometry: { type: 'Point', coordinates: [-70.5, 43.5] },
  }],
};

describe('findCandidateLayers', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users', async () => {
    mockUser = null;
    const { findCandidateLayers } = await import('../actions');
    const result = await findCandidateLayers('org-1', 'prop-1', [-71, 43, -70, 44]);
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns layers on success', async () => {
    const layers = [
      { id: 'layer-1', name: 'Test Layer', bbox: [-71, 43, -70, 44], feature_count: 5 },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'geo_layer_properties') {
        return mockQueryResult(() => ({ data: [{ geo_layer_id: 'already-assigned' }], error: null }));
      }
      if (table === 'geo_layers') {
        return mockQueryResult(() => ({ data: layers, error: null }));
      }
      return mockQueryResult(() => ({ data: [], error: null }));
    });

    const { findCandidateLayers } = await import('../actions');
    const result = await findCandidateLayers('org-1', 'prop-1', [-71, 43, -70, 44]);
    expect('success' in result && result.success).toBe(true);
  });
});

describe('createDiscoveredLayer', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users', async () => {
    mockUser = null;
    const { createDiscoveredLayer } = await import('../actions');
    const result = await createDiscoveredLayer({
      orgId: 'org-1',
      propertyId: 'prop-1',
      name: 'Discovered Layer',
      features: sampleFC.features,
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('creates a layer and assigns to property on success', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'geo_layers') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-layer-id' }, error: null })),
            })),
          })),
        };
      }
      if (table === 'geo_layer_properties') {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null })),
        };
      }
      return mockQueryResult(() => ({ data: null, error: null }));
    });

    const { createDiscoveredLayer } = await import('../actions');
    const result = await createDiscoveredLayer({
      orgId: 'org-1',
      propertyId: 'prop-1',
      name: 'Discovered',
      features: sampleFC.features,
    });
    expect('success' in result && result.success).toBe(true);
  });
});
