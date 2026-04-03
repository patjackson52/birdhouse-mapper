import { describe, it, expect, vi, beforeEach } from 'vitest';

let authUser: { id: string } | null = { id: 'user-123' };
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];
let updatedRows: { table: string; updates: Record<string, unknown> }[] = [];
let deletedRows: { table: string }[] = [];
let insertError: Error | null = null;
let updateError: Error | null = null;
let deleteError: Error | null = null;
let fakeSelectData: Record<string, unknown>[] | null = null;
let fakeSingleData: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: authUser },
          error: authUser ? null : new Error('Not authenticated'),
        })
      ),
    },
    from: (table: string) => {
      const chainable = {
        select: vi.fn(() => chainable),
        insert: vi.fn((payload: any) => {
          if (insertError) {
            return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: insertError })) })) };
          }
          insertedRows.push({ table, payload });
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', ...payload }, error: null })),
            })),
          };
        }),
        update: vi.fn((updates: any) => {
          if (updateError) {
            return { eq: vi.fn(() => Promise.resolve({ error: updateError })) };
          }
          updatedRows.push({ table, updates });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
        delete: vi.fn(() => {
          if (deleteError) {
            return { eq: vi.fn(() => Promise.resolve({ error: deleteError })) };
          }
          deletedRows.push({ table });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
        eq: vi.fn(() => chainable),
        ilike: vi.fn(() => chainable),
        overlaps: vi.fn(() => chainable),
        order: vi.fn(() => chainable),
        single: vi.fn(() => Promise.resolve({ data: fakeSingleData, error: fakeSingleData ? null : new Error('Not found') })),
      };
      chainable.select = vi.fn(() => ({
        ...chainable,
        eq: vi.fn(() => ({
          ...chainable,
          single: vi.fn(() => Promise.resolve({ data: fakeSingleData, error: fakeSingleData ? null : new Error('Not found') })),
        })),
        then: vi.fn((cb: any) => cb({ data: fakeSelectData ?? [], error: null })),
      }));
      return chainable;
    },
  }),
}));

beforeEach(() => {
  authUser = { id: 'user-123' };
  insertedRows = [];
  updatedRows = [];
  deletedRows = [];
  insertError = null;
  updateError = null;
  deleteError = null;
  fakeSelectData = null;
  fakeSingleData = null;
});

describe('createKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('inserts a knowledge item with generated slug', async () => {
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({
      orgId: 'org-1',
      title: 'How to Clean Birdhouses',
      tags: ['maintenance'],
    });
    expect(result).toHaveProperty('success', true);
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].table).toBe('knowledge_items');
    expect(insertedRows[0].payload).toMatchObject({
      org_id: 'org-1',
      title: 'How to Clean Birdhouses',
      tags: ['maintenance'],
      created_by: 'user-123',
      updated_by: 'user-123',
    });
  });

  it('returns error when insert fails', async () => {
    insertError = new Error('Duplicate slug');
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error');
  });
});

describe('deleteKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { deleteKnowledgeItem } = await import('../actions');
    const result = await deleteKnowledgeItem('item-1');
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });
});
