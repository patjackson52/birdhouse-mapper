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

/**
 * Convert a Blob to a base64-encoded string (no data: prefix). Used by the
 * outbound sync engine before calling `moderatePhotoUpload`, which expects
 * the image as base64. Chunked to avoid call-stack overflow on multi-MB
 * blobs (`String.fromCharCode(...largeArray)` blows up around 100k args).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Browsers (and jsdom) provide btoa; Node provides Buffer. Prefer btoa
  // when present so the same code path runs in the test environment.
  if (typeof btoa === 'function') {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }
  // Fallback for non-browser test runners that lack btoa.
  return Buffer.from(buffer).toString('base64');
}
