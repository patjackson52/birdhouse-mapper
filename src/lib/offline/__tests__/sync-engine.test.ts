import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import { enqueueMutation } from '../mutations';
import { processOutboundQueue } from '../sync-engine';

const mockFrom = vi.fn();
const mockStorage = { from: vi.fn() };
const mockSupabase = {
  from: mockFrom,
  storage: mockStorage,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
};

describe('Sync Engine — Outbound', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
    vi.clearAllMocks();
  });

  it('should process pending insert mutations via Supabase', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'item-1' }, error: null }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    const remaining = await db.mutation_queue.toArray();
    expect(remaining).toHaveLength(0);
  });

  it('should process pending update mutations', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue({ update: updateMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'update',
      record_id: 'item-1',
      payload: { name: 'Updated' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Updated' });
  });

  it('should mark mutations as failed on error and increment retry', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'RLS violation' } }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.failed).toBe(1);

    const mutations = await db.mutation_queue.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].status).toBe('failed');
    expect(mutations[0].retry_count).toBe(1);
    expect(mutations[0].error).toBe('RLS violation');
  });

  it('should skip mutations that exceed max retries', async () => {
    await db.mutation_queue.put({
      id: 'mut-1',
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1' },
      org_id: 'o',
      property_id: 'p',
      created_at: Date.now(),
      status: 'failed',
      retry_count: 5,
      error: 'Permanent error',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('should process mutations in FIFO order', async () => {
    const callOrder: string[] = [];
    mockFrom.mockImplementation(() => ({
      insert: (payload: any) => {
        callOrder.push(payload.id || payload[0]?.id);
        return { select: () => ({ single: () => Promise.resolve({ data: payload, error: null }) }) };
      },
    }));

    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'first', payload: { id: 'first' }, org_id: 'o', property_id: 'p' });
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'second', payload: { id: 'second' }, org_id: 'o', property_id: 'p' });

    await processOutboundQueue(db, mockSupabase as any);
    expect(callOrder).toEqual(['first', 'second']);
  });
});
