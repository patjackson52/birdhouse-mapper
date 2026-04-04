import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: vi.fn().mockResolvedValue({ orgId: 'org1' }),
}));

import { saveTypeWithLayout, deleteLayout } from '../layout-actions';

describe('saveTypeWithLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns error when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: { version: 1, blocks: [{ id: 'b1', type: 'divider', config: {} }], spacing: 'comfortable', peekBlockCount: 1 },
      newFields: [],
    });
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('returns error for invalid layout', async () => {
    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: { version: 1, blocks: [], spacing: 'comfortable', peekBlockCount: 0 } as any,
      newFields: [],
    });
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('Invalid layout') }));
  });

  it('saves layout and creates new fields', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ error: null }) });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ data: [{ id: 'new-f1' }], error: null }) });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'item_types') return { update: updateMock };
      if (table === 'custom_fields') return { insert: insertMock };
      return {};
    });

    const result = await saveTypeWithLayout({
      itemTypeId: 't1',
      layout: {
        version: 1,
        blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
        spacing: 'comfortable',
        peekBlockCount: 1,
      },
      newFields: [
        { name: 'Species', field_type: 'dropdown', options: ['Robin'], required: true, sort_order: 0 },
      ],
    });
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });
});

describe('deleteLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns error when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await deleteLayout('t1');
    expect(result).toEqual({ error: 'Not authenticated' });
  });

  it('deletes layout successfully', async () => {
    const eqMock = vi.fn().mockReturnValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockSupabase.from.mockReturnValue({ update: updateMock });

    const result = await deleteLayout('t1');
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ layout: null });
    expect(eqMock).toHaveBeenCalledWith('id', 't1');
  });
});
