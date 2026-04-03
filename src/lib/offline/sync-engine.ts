import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfflineDatabase } from './db';
import type { MutationRecord } from './types';
import { getPendingMutations, markInFlight, markCompleted, markFailed, removeMutation } from './mutations';
import { getPhotoBlobs, removePhotoBlobsByMutation } from './photo-store';

const MAX_RETRIES = 5;

interface SyncResult {
  processed: number;
  failed: number;
  skipped: number;
}

export async function processOutboundQueue(
  db: OfflineDatabase,
  supabase: SupabaseClient
): Promise<SyncResult> {
  const pending = await getPendingMutations(db);
  const result: SyncResult = { processed: 0, failed: 0, skipped: 0 };

  for (const mutation of pending) {
    if (mutation.retry_count >= MAX_RETRIES) {
      result.skipped++;
      continue;
    }

    await markInFlight(db, mutation.id);

    try {
      const error = await executeMutation(db, supabase, mutation);

      if (error) {
        await markFailed(db, mutation.id, error);
        result.failed++;
      } else {
        await markCompleted(db, mutation.id);
        await removePhotoBlobsByMutation(db, mutation.id);
        await removeMutation(db, mutation.id);
        result.processed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await markFailed(db, mutation.id, message);
      result.failed++;
    }
  }

  return result;
}

async function executeMutation(
  db: OfflineDatabase,
  supabase: SupabaseClient,
  mutation: MutationRecord
): Promise<string | null> {
  // Handle photo uploads first if this mutation has associated blobs
  const photoBlobs = await getPhotoBlobs(db, mutation.id);
  for (const photoBlob of photoBlobs) {
    const storagePath = `${photoBlob.item_id}/${Date.now()}_${photoBlob.filename}`;
    const { error: uploadError } = await supabase.storage
      .from('vault-public')
      .upload(storagePath, photoBlob.blob);

    if (uploadError) {
      return `Photo upload failed: ${uploadError.message}`;
    }

    const { error: photoInsertError } = await supabase.from('photos').insert({
      item_id: photoBlob.item_id,
      update_id: photoBlob.update_id,
      storage_path: storagePath,
      is_primary: photoBlob.is_primary,
    });

    if (photoInsertError) {
      return `Photo record insert failed: ${photoInsertError.message}`;
    }
  }

  switch (mutation.operation) {
    case 'insert': {
      const { error } = await supabase
        .from(mutation.table)
        .insert(mutation.payload)
        .select()
        .single();
      return error ? error.message : null;
    }
    case 'update': {
      const { error } = await supabase
        .from(mutation.table)
        .update(mutation.payload)
        .eq('id', mutation.record_id);
      return error ? error.message : null;
    }
    case 'delete': {
      // If the payload contains filter criteria other than 'id', use those instead
      // of the default eq('id', record_id). This supports join-table deletes like
      // item_entities where all rows matching item_id should be removed.
      const payloadKeys = Object.keys(mutation.payload || {});
      const hasCustomFilter = payloadKeys.length > 0 && !(payloadKeys.length === 1 && payloadKeys[0] === 'id');
      let deleteQuery = supabase.from(mutation.table).delete();
      if (hasCustomFilter) {
        for (const [key, value] of Object.entries(mutation.payload as Record<string, unknown>)) {
          deleteQuery = deleteQuery.eq(key, value as string);
        }
      } else {
        deleteQuery = deleteQuery.eq('id', mutation.record_id);
      }
      const { error } = await deleteQuery;
      return error ? error.message : null;
    }
    default:
      return `Unknown operation: ${mutation.operation}`;
  }
}

// ---- Inbound Sync (Server → Client) ----

// Tables that have an `updated_at` column for delta sync.
// Tables not listed here only have `created_at` — we use that instead.
const TABLES_WITH_UPDATED_AT = new Set([
  'items', 'properties', 'orgs', 'roles', 'org_memberships', 'entities', 'entity_types',
]);

const SYNC_TABLES = [
  'items', 'item_types', 'custom_fields', 'item_updates', 'update_types',
  'update_type_fields', 'photos', 'entities', 'entity_types', 'geo_layers',
  'properties', 'orgs', 'roles', 'org_memberships',
] as const;

export async function syncPropertyData(
  db: OfflineDatabase,
  supabase: SupabaseClient,
  propertyId: string,
  orgId: string
): Promise<void> {
  const now = new Date().toISOString();

  for (const tableName of SYNC_TABLES) {
    const metaId = `${propertyId}:${tableName}`;
    const meta = await db.sync_metadata.get(metaId);
    const lastSynced = meta?.last_synced_at || '1970-01-01T00:00:00Z';

    let query = supabase.from(tableName).select('*');

    const propertyScoped = ['items', 'item_updates', 'photos', 'geo_layers'];
    const orgScoped = ['item_types', 'custom_fields', 'update_types', 'update_type_fields', 'entities', 'entity_types', 'roles', 'org_memberships'];

    if (propertyScoped.includes(tableName)) {
      query = query.eq('property_id', propertyId);
    } else if (orgScoped.includes(tableName)) {
      query = query.eq('org_id', orgId);
    } else if (tableName === 'properties') {
      query = query.eq('id', propertyId);
    } else if (tableName === 'orgs') {
      query = query.eq('id', orgId);
    }

    // Use updated_at for delta sync on tables that have it, created_at otherwise
    const timestampColumn = TABLES_WITH_UPDATED_AT.has(tableName) ? 'updated_at' : 'created_at';
    query = query.gte(timestampColumn, lastSynced);

    const { data, error } = await query;

    if (error) {
      await db.sync_metadata.put({
        id: metaId, property_id: propertyId, table_name: tableName,
        last_synced_at: meta?.last_synced_at || '', record_count: meta?.record_count || 0, status: 'error',
      });
      continue;
    }

    if (data && data.length > 0) {
      const withSyncedAt = data.map((record: Record<string, unknown>) => ({ ...record, _synced_at: now }));
      const table = db.table(tableName);
      await table.bulkPut(withSyncedAt);
    }

    const totalCount = await db.table(tableName).count();
    await db.sync_metadata.put({
      id: metaId, property_id: propertyId, table_name: tableName,
      last_synced_at: now, record_count: totalCount, status: 'fresh',
    });
  }

  // Discard local pending mutations that conflict with newer server data
  const pendingMutations = await db.mutation_queue.where('status').anyOf('pending', 'failed').toArray();
  for (const mutation of pendingMutations) {
    if (mutation.property_id !== propertyId) continue;
    const serverRecord = await db.table(mutation.table).get(mutation.record_id);
    if (!serverRecord) continue;
    const serverTimestamp = serverRecord.updated_at || serverRecord.created_at;
    if (serverTimestamp && new Date(serverTimestamp).getTime() > mutation.created_at) {
      await db.mutation_queue.delete(mutation.id);
      await db.photo_blobs.where('mutation_id').equals(mutation.id).delete();
    }
  }
}
