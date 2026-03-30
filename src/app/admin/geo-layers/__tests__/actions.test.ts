import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockUser: any = { id: 'user-1' };
let mockIsAdmin = true;
let mockInsertResult: any = { data: [{ id: 'layer-1' }], error: null };
let mockSelectResult: any = { data: [], error: null };
let mockUpdateResult: any = { data: null, error: null };
let mockDeleteResult: any = { data: null, error: null };

const mockFrom = vi.fn(() => ({
  insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(mockInsertResult)) })) })),
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => Promise.resolve(mockSelectResult)),
      single: vi.fn(() => Promise.resolve(mockSelectResult)),
    })),
    in: vi.fn(() => Promise.resolve(mockSelectResult)),
  })),
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
});
