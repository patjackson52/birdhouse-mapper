import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import {
  enqueueMutation,
  getPendingMutations,
  markInFlight,
  markCompleted,
  markFailed,
  removeMutation,
} from '../mutations';

describe('Mutation Queue', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
  });

  it('should enqueue a mutation with pending status', async () => {
    const id = await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { name: 'Test' },
      org_id: 'org-1',
      property_id: 'prop-1',
    });

    const record = await db.mutation_queue.get(id);
    expect(record).toBeDefined();
    expect(record!.status).toBe('pending');
    expect(record!.retry_count).toBe(0);
    expect(record!.error).toBeNull();
  });

  it('should return pending mutations in FIFO order', async () => {
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation(db, { table: 'items', operation: 'update', record_id: 'b', payload: {}, org_id: 'o', property_id: 'p' });

    const pending = await getPendingMutations(db);
    expect(pending).toHaveLength(2);
    expect(pending[0].record_id).toBe('a');
    expect(pending[1].record_id).toBe('b');
  });

  it('should mark a mutation as in_flight', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markInFlight(db, id);
    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('in_flight');
  });

  it('should mark a mutation as completed', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markCompleted(db, id);
    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('completed');
  });

  it('should mark a mutation as failed with error and increment retry_count', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markFailed(db, id, 'Network error');
    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('failed');
    expect(record!.retry_count).toBe(1);
    expect(record!.error).toBe('Network error');
  });

  it('should remove a completed mutation', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await removeMutation(db, id);
    const record = await db.mutation_queue.get(id);
    expect(record).toBeUndefined();
  });

  it('should not return in_flight or completed mutations as pending', async () => {
    const id1 = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    const id2 = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'b', payload: {}, org_id: 'o', property_id: 'p' });
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'c', payload: {}, org_id: 'o', property_id: 'p' });
    await markInFlight(db, id1);
    await markCompleted(db, id2);
    const pending = await getPendingMutations(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].record_id).toBe('c');
  });
});
