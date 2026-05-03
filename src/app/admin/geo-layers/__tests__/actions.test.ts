import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeoLayerPublicIfNewer } from '../actions';

let mockUser: any = { id: 'user-1' };
let mockIsAdmin = true;
let mockInsertResult: any = { data: [{ id: 'layer-1' }], error: null };
let mockSelectResult: any = { data: [], error: null };
let mockUpdateResult: any = { data: null, error: null };
let mockDeleteResult: any = { data: null, error: null };

// Thenable object that also exposes chaining methods — covers both
// `.select().eq()` (awaited directly) and `.select().eq().order()` paths.
function mockQueryResult(resultFn: () => any) {
  const obj: any = {
    eq: vi.fn(() => obj),
    order: vi.fn(() => Promise.resolve(resultFn())),
    single: vi.fn(() => Promise.resolve(resultFn())),
    in: vi.fn(() => Promise.resolve(resultFn())),
    then: (resolve: any, reject?: any) => Promise.resolve(resultFn()).then(resolve, reject),
  };
  return obj;
}

const mockFrom = vi.fn(() => ({
  insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(mockInsertResult)) })) })),
  select: vi.fn(() => mockQueryResult(() => mockSelectResult)),
  update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(mockUpdateResult)) })),
  delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve(mockDeleteResult)) })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    from: mockFrom,
  }),
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

describe('geo layer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockIsAdmin = true;
    mockInsertResult = { data: { id: 'layer-1' }, error: null };
    mockSelectResult = { data: [], error: null };
  });

  it('rejects unauthenticated users on createGeoLayer', async () => {
    mockUser = null;
    const { createGeoLayer } = await import('../actions');
    const result = await createGeoLayer({
      orgId: 'org-1',
      name: 'Test Layer',
      geojson: { type: 'FeatureCollection', features: [] },
      sourceFormat: 'geojson',
      sourceFilename: 'test.geojson',
      color: '#3b82f6',
      opacity: 0.6,
      featureCount: 0,
      bbox: null,
      isPropertyBoundary: false,
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('rejects unauthenticated users on publishGeoLayer', async () => {
    mockUser = null;
    const { publishGeoLayer } = await import('../actions');
    const result = await publishGeoLayer('layer-1');
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('rejects unauthenticated users on unpublishGeoLayer', async () => {
    mockUser = null;
    const { unpublishGeoLayer } = await import('../actions');
    const result = await unpublishGeoLayer('layer-1');
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('publishGeoLayer calls update with published status', async () => {
    mockUser = { id: 'user-1' };
    mockUpdateResult = { data: null, error: null };
    const { publishGeoLayer } = await import('../actions');
    const result = await publishGeoLayer('layer-1');
    expect(result).toEqual({ success: true });
    expect(mockFrom).toHaveBeenCalledWith('geo_layers');
  });

  it('unpublishGeoLayer calls update with draft status', async () => {
    mockUser = { id: 'user-1' };
    mockUpdateResult = { data: null, error: null };
    const { unpublishGeoLayer } = await import('../actions');
    const result = await unpublishGeoLayer('layer-1');
    expect(result).toEqual({ success: true });
    expect(mockFrom).toHaveBeenCalledWith('geo_layers');
  });

  it('rejects unauthenticated users on getOrgLayerAssignments', async () => {
    mockUser = null;
    const { getOrgLayerAssignments } = await import('../actions');
    const result = await getOrgLayerAssignments('org-1');
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('getOrgLayerAssignments returns assignments for the org', async () => {
    mockUser = { id: 'user-1' };
    const mockAssignments = [
      { geo_layer_id: 'layer-1', property_id: 'prop-1', org_id: 'org-1', visible_default: true },
      { geo_layer_id: 'layer-1', property_id: 'prop-2', org_id: 'org-1', visible_default: true },
    ];
    mockSelectResult = { data: mockAssignments, error: null };
    const { getOrgLayerAssignments } = await import('../actions');
    const result = await getOrgLayerAssignments('org-1');
    expect(result).toEqual({ success: true, assignments: mockAssignments });
    expect(mockFrom).toHaveBeenCalledWith('geo_layer_properties');
  });

  it('rejects unauthenticated users on assignLayerToProperties', async () => {
    mockUser = null;
    const { assignLayerToProperties } = await import('../actions');
    const result = await assignLayerToProperties('layer-1', 'org-1', ['prop-1']);
    expect(result).toEqual({ error: 'Not authenticated' });
  });
});

describe('getGeoLayerPublicIfNewer', () => {
  it('returns { unchanged: true } when no newer row exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any);
    const result = await getGeoLayerPublicIfNewer('layer-1', '2026-05-01T00:00:00Z');
    expect(result).toEqual({ unchanged: true });
    expect(mockFrom).toHaveBeenCalledWith('geo_layers');
  });

  it('returns full layer when DB has a newer row', async () => {
    const newerLayer = {
      id: 'layer-1',
      org_id: 'org-1',
      name: 'Layer 1',
      geojson: { type: 'FeatureCollection', features: [] },
      updated_at: '2026-05-02T00:00:00Z',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: newerLayer, error: null }),
          }),
        }),
      }),
    } as any);
    const result = await getGeoLayerPublicIfNewer('layer-1', '2026-05-01T00:00:00Z');
    expect(result).toEqual({ success: true, layer: newerLayer });
  });

  it('returns error when the query fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } }),
          }),
        }),
      }),
    } as any);
    const result = await getGeoLayerPublicIfNewer('layer-1', '2026-05-01T00:00:00Z');
    expect(result).toEqual({ error: 'rls denied' });
  });
});
