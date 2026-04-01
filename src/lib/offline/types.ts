export type MutationOperation = 'insert' | 'update' | 'delete';
export type MutationStatus = 'pending' | 'in_flight' | 'failed' | 'completed';

export interface MutationRecord {
  id: string;
  table: string;
  operation: MutationOperation;
  record_id: string;
  payload: Record<string, unknown>;
  org_id: string;
  property_id: string;
  created_at: number;
  status: MutationStatus;
  retry_count: number;
  error: string | null;
}

export interface PhotoBlob {
  id: string;
  mutation_id: string;
  blob: Blob;
  filename: string;
  item_id: string;
  update_id: string | null;
  is_primary: boolean;
  created_at: number;
}

export interface SyncMetadata {
  id: string; // Composite key: `${property_id}:${table_name}`
  property_id: string;
  table_name: string;
  last_synced_at: string;
  record_count: number;
  status: 'fresh' | 'stale' | 'syncing' | 'error';
}

export interface TileCacheMetadata {
  id: string; // Composite key: `${property_id}:${zoom}`
  property_id: string;
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number };
  tile_count: number;
  downloaded_count: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}

export interface CachedRecord {
  _synced_at: string;
}
