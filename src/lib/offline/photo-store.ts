import type { OfflineDatabase } from './db';
import type { PhotoBlob } from './types';

interface StorePhotoBlobParams {
  mutation_id: string;
  blob: Blob;
  filename: string;
  item_id: string;
  update_id: string | null;
  is_primary: boolean;
}

export async function storePhotoBlob(db: OfflineDatabase, params: StorePhotoBlobParams): Promise<string> {
  const id = crypto.randomUUID();
  const record: PhotoBlob = { id, ...params, created_at: Date.now() };
  await db.photo_blobs.put(record);
  return id;
}

export async function getPhotoBlobs(db: OfflineDatabase, mutationId: string): Promise<PhotoBlob[]> {
  return db.photo_blobs.where('mutation_id').equals(mutationId).toArray();
}

export async function getPhotoBlobsByItem(db: OfflineDatabase, itemId: string): Promise<PhotoBlob[]> {
  return db.photo_blobs.where('item_id').equals(itemId).toArray();
}

export async function removePhotoBlob(db: OfflineDatabase, id: string): Promise<void> {
  await db.photo_blobs.delete(id);
}

export async function removePhotoBlobsByMutation(db: OfflineDatabase, mutationId: string): Promise<void> {
  await db.photo_blobs.where('mutation_id').equals(mutationId).delete();
}
