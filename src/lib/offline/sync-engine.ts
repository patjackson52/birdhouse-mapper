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
    // The vault-public bucket RLS (migration 026) requires the first path
    // segment to be an org_id the user has active membership in:
    //   (storage.foldername(name))[1] in (select id::text from orgs where
    //     id in (select user_active_org_ids()))
    // Previously we uploaded to `${item_id}/...` which always failed the
    // RLS check; every photo upload through this path was silently rejected
    // and the mutation retried up to MAX_RETRIES with no visible error.
    const storagePath = `${mutation.org_id}/${photoBlob.item_id}/${Date.now()}_${photoBlob.filename}`;
    const { error: uploadError } = await supabase.storage
      .from('vault-public')
      .upload(storagePath, photoBlob.blob);

    if (uploadError) {
      return `Photo upload failed: ${uploadError.message}`;
    }

    // Pass org_id + property_id explicitly rather than relying on the
    // auto_populate_org_property trigger, which derives property_id from
    // `orgs.default_property_id` — wrong whenever the item isn't on the
    // user's default property, and silently causes the RLS check to fail
    // against the wrong property. The mutation carries the correct scope
    // (set when enqueued for the specific item).
    const { data: insertedPhoto, error: photoInsertError } = await supabase
      .from('photos')
      .insert({
        item_id: photoBlob.item_id,
        update_id: photoBlob.update_id,
        storage_path: storagePath,
        is_primary: photoBlob.is_primary,
        org_id: mutation.org_id,
        property_id: mutation.property_id,
      })
      .select()
      .single();

    if (photoInsertError) {
      return `Photo record insert failed: ${photoInsertError.message}`;
    }

    // Mirror the new row into IndexedDB so the item detail panel (which reads
    // from the local cache via offlineStore.getPhotos) sees the photo as soon
    // as the user navigates back — without waiting for the next inbound
    // syncPropertyData tick. The OfflineProvider is mounted at the app root
    // and its inbound-sync effect only re-runs on propertyId / isOnline
    // change, so route navigation alone doesn't refresh the cache.
    if (insertedPhoto) {
      await db.photos.put({ ...insertedPhoto, _synced_at: new Date().toISOString() });
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
  'items', 'item_types', 'properties', 'orgs', 'roles', 'org_memberships', 'entities', 'entity_types',
]);

// Tables that have no timestamp column at all — always do a full sync.
const TABLES_WITHOUT_TIMESTAMPS = new Set([
  'update_types', 'update_type_fields', 'custom_fields',
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

    // Use updated_at for delta sync on tables that have it, created_at otherwise.
    // Tables without any timestamp column always do a full sync.
    if (!TABLES_WITHOUT_TIMESTAMPS.has(tableName)) {
      const timestampColumn = TABLES_WITH_UPDATED_AT.has(tableName) ? 'updated_at' : 'created_at';
      query = query.gte(timestampColumn, lastSynced);
    }

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

    // Reconcile deletions: delta sync (keyed on created_at / updated_at) can
    // never detect hard-deleted rows on the server — the local cache would
    // keep the deleted row forever, causing UI drift (e.g., item detail shows
    // a photo that the edit page no longer lists). Re-query the authoritative
    // ID set for this table+scope and drop any local rows that are missing.
    // Cheap: select id only, bounded by property/org scope.
    const scopeColumn = propertyScoped.includes(tableName)
      ? 'property_id'
      : orgScoped.includes(tableName)
      ? 'org_id'
      : null;
    if (scopeColumn) {
      const { data: idRows, error: idError } = await supabase
        .from(tableName)
        .select('id')
        .eq(scopeColumn, scopeColumn === 'property_id' ? propertyId : orgId);
      if (!idError && idRows) {
        const serverIds = new Set((idRows as Array<{ id: string }>).map((r) => r.id));
        const scopeValue = scopeColumn === 'property_id' ? propertyId : orgId;
        const localRows = (await db
          .table(tableName)
          .where(scopeColumn)
          .equals(scopeValue)
          .toArray()) as Array<{ id: string; _synced_at?: string }>;
        // Only delete rows that have been synced from the server at some point.
        // Rows with empty _synced_at are local pending inserts — the server
        // doesn't have them yet, so their absence from the ID set is expected.
        const toDelete = localRows
          .filter((r) => !serverIds.has(r.id) && !!r._synced_at)
          .map((r) => r.id);
        if (toDelete.length > 0) {
          await db.table(tableName).bulkDelete(toDelete);
        }
      }
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
