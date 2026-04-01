import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import { storePhotoBlob, getPhotoBlobs, removePhotoBlob } from '../photo-store';

describe('Photo Blob Storage', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
  });

  it('should store a photo blob linked to a mutation', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    const id = await storePhotoBlob(db, {
      mutation_id: 'mut-1',
      blob,
      filename: 'photo.jpg',
      item_id: 'item-1',
      update_id: null,
      is_primary: true,
    });

    const stored = await db.photo_blobs.get(id);
    expect(stored).toBeDefined();
    expect(stored!.filename).toBe('photo.jpg');
    expect(stored!.is_primary).toBe(true);
  });

  it('should retrieve blobs by mutation_id', async () => {
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    await storePhotoBlob(db, { mutation_id: 'mut-1', blob, filename: 'a.jpg', item_id: 'i', update_id: null, is_primary: true });
    await storePhotoBlob(db, { mutation_id: 'mut-1', blob, filename: 'b.jpg', item_id: 'i', update_id: null, is_primary: false });
    await storePhotoBlob(db, { mutation_id: 'mut-2', blob, filename: 'c.jpg', item_id: 'i', update_id: null, is_primary: true });

    const blobs = await getPhotoBlobs(db, 'mut-1');
    expect(blobs).toHaveLength(2);
  });

  it('should remove a photo blob', async () => {
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    const id = await storePhotoBlob(db, { mutation_id: 'mut-1', blob, filename: 'a.jpg', item_id: 'i', update_id: null, is_primary: true });

    await removePhotoBlob(db, id);
    const stored = await db.photo_blobs.get(id);
    expect(stored).toBeUndefined();
  });
});
