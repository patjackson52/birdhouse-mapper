import type { OfflineDatabase } from './db';
import type { MutationOperation, MutationRecord } from './types';

interface EnqueueParams {
  table: string;
  operation: MutationOperation;
  record_id: string;
  payload: Record<string, unknown>;
  org_id: string;
  property_id: string;
}

export async function enqueueMutation(db: OfflineDatabase, params: EnqueueParams): Promise<string> {
  const id = crypto.randomUUID();
  const record: MutationRecord = {
    id,
    ...params,
    created_at: Date.now(),
    status: 'pending',
    retry_count: 0,
    error: null,
  };
  await db.mutation_queue.put(record);
  return id;
}

export async function getPendingMutations(db: OfflineDatabase): Promise<MutationRecord[]> {
  return db.mutation_queue.where('status').anyOf('pending', 'failed').sortBy('created_at');
}

export async function markInFlight(db: OfflineDatabase, id: string): Promise<void> {
  await db.mutation_queue.update(id, { status: 'in_flight' });
}

export async function markCompleted(db: OfflineDatabase, id: string): Promise<void> {
  await db.mutation_queue.update(id, { status: 'completed' });
}

export async function markFailed(db: OfflineDatabase, id: string, error: string): Promise<void> {
  const record = await db.mutation_queue.get(id);
  if (!record) return;
  await db.mutation_queue.update(id, { status: 'failed', retry_count: record.retry_count + 1, error });
}

export async function removeMutation(db: OfflineDatabase, id: string): Promise<void> {
  await db.mutation_queue.delete(id);
}

export async function getPendingCount(db: OfflineDatabase): Promise<number> {
  return db.mutation_queue.where('status').anyOf('pending', 'failed', 'in_flight').count();
}
