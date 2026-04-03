import { describe, it, expect, vi, beforeEach } from 'vitest';

let authUser: { id: string } | null = { id: 'user-123' };
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];
let deletedTables: string[] = [];
let insertError: Error | null = null;
let updateError: Error | null = null;
let deleteError: Error | null = null;
let selectData: Record<string, unknown>[] = [];
let singleData: Record<string, unknown> | null = null;

function makeChainable(table: string) {
  const self: any = {};
  self.select = vi.fn(() => self);
  self.insert = vi.fn((payload: any) => {
    if (insertError) {
      const p: any = Promise.resolve({ data: null, error: insertError });
      p.select = vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: insertError })) }));
      return p;
    }
    insertedRows.push({ table, payload });
    const p: any = Promise.resolve({ data: { id: 'new-id', slug: 'test-slug', ...payload }, error: null });
    p.select = vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', slug: 'test-slug', ...payload }, error: null })),
    }));
    return p;
  });
  self.update = vi.fn((updates: any) => {
    if (updateError) return { eq: vi.fn(() => Promise.resolve({ error: updateError })) };
    return { eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) };
  });
  self.delete = vi.fn(() => {
    if (deleteError) return { eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: deleteError })) })) };
    deletedTables.push(table);
    return { eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) };
  });
  self.eq = vi.fn(() => self);
  self.ilike = vi.fn(() => self);
  self.overlaps = vi.fn(() => self);
  self.in = vi.fn(() => self);
  self.order = vi.fn(() => Promise.resolve({ data: selectData, error: null }));
  self.single = vi.fn(() => Promise.resolve({ data: singleData, error: singleData ? null : new Error('Not found') }));
  return self;
}

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
    from: (table: string) => makeChainable(table),
  }),
}));

beforeEach(() => {
  authUser = { id: 'user-123' };
  insertedRows = [];
  deletedTables = [];
  insertError = null;
  updateError = null;
  deleteError = null;
  selectData = [];
  singleData = null;
});

describe('createKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('inserts with correct fields and generated slug', async () => {
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({
      orgId: 'org-1',
      title: 'How to Clean Birdhouses',
      tags: ['maintenance'],
      visibility: 'public',
      isAiContext: true,
    });
    expect(result).toHaveProperty('success', true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('knowledge_items');
    const payload = insertedRows[0].payload as Record<string, unknown>;
    expect(payload.org_id).toBe('org-1');
    expect(payload.title).toBe('How to Clean Birdhouses');
    expect(payload.tags).toEqual(['maintenance']);
    expect(payload.visibility).toBe('public');
    expect(payload.is_ai_context).toBe(true);
    expect(payload.created_by).toBe('user-123');
    expect(payload.updated_by).toBe('user-123');
    expect(typeof payload.slug).toBe('string');
    expect((payload.slug as string).length).toBeGreaterThan(0);
  });

  it('defaults visibility to org and is_ai_context to true', async () => {
    const { createKnowledgeItem } = await import('../actions');
    await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    const payload = insertedRows[0].payload as Record<string, unknown>;
    expect(payload.visibility).toBe('org');
    expect(payload.is_ai_context).toBe(true);
  });

  it('returns error when insert fails', async () => {
    insertError = new Error('Duplicate slug');
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Duplicate slug');
  });
});

describe('updateKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { updateKnowledgeItem } = await import('../actions');
    const result = await updateKnowledgeItem('id-1', { title: 'Updated' });
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('returns success for valid update', async () => {
    const { updateKnowledgeItem } = await import('../actions');
    const result = await updateKnowledgeItem('id-1', { title: 'Updated Title', tags: ['new-tag'] });
    expect(result).toHaveProperty('success', true);
  });
});

describe('deleteKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { deleteKnowledgeItem } = await import('../actions');
    const result = await deleteKnowledgeItem('id-1');
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('returns success for valid delete', async () => {
    const { deleteKnowledgeItem } = await import('../actions');
    const result = await deleteKnowledgeItem('id-1');
    expect(result).toHaveProperty('success', true);
  });
});

describe('linkKnowledgeToItem', () => {
  it('inserts into knowledge_item_items', async () => {
    const { linkKnowledgeToItem } = await import('../actions');
    const result = await linkKnowledgeToItem('k1', 'item-1', 'org-1');
    expect(result).toHaveProperty('success', true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('knowledge_item_items');
  });

  it('returns error on insert failure', async () => {
    insertError = new Error('FK violation');
    const { linkKnowledgeToItem } = await import('../actions');
    const result = await linkKnowledgeToItem('k1', 'bad-item', 'org-1');
    expect(result).toHaveProperty('error');
  });
});

describe('linkKnowledgeToUpdate', () => {
  it('inserts into knowledge_item_updates', async () => {
    const { linkKnowledgeToUpdate } = await import('../actions');
    const result = await linkKnowledgeToUpdate('k1', 'update-1', 'org-1');
    expect(result).toHaveProperty('success', true);
    expect(insertedRows[0].table).toBe('knowledge_item_updates');
  });
});

describe('linkKnowledgeToEntity', () => {
  it('inserts into knowledge_item_entities', async () => {
    const { linkKnowledgeToEntity } = await import('../actions');
    const result = await linkKnowledgeToEntity('k1', 'entity-1', 'org-1');
    expect(result).toHaveProperty('success', true);
    expect(insertedRows[0].table).toBe('knowledge_item_entities');
  });
});

describe('addAttachment', () => {
  it('inserts into knowledge_attachments with sort_order', async () => {
    const { addAttachment } = await import('../actions');
    const result = await addAttachment('k1', 'vault-1', 2);
    expect(result).toHaveProperty('success', true);
    expect(insertedRows[0].table).toBe('knowledge_attachments');
    expect((insertedRows[0].payload as any).sort_order).toBe(2);
  });

  it('defaults sort_order to 0', async () => {
    const { addAttachment } = await import('../actions');
    await addAttachment('k1', 'vault-1');
    expect((insertedRows[0].payload as any).sort_order).toBe(0);
  });
});
