import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import { getCachedLayer, putCachedLayer, bulkGetCachedLayers } from '../geo-layer-cache';
import type { FeatureCollection } from 'geojson';

const FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

describe('geo-layer-cache', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.geo_layer_cache.clear();
  });

  it('getCachedLayer returns undefined when no row exists', async () => {
    const row = await getCachedLayer(db, 'layer-missing');
    expect(row).toBeUndefined();
  });

  it('putCachedLayer inserts a new row and getCachedLayer reads it back', async () => {
    await putCachedLayer(db, 'layer-1', '2026-05-02T00:00:00Z', FC);
    const row = await getCachedLayer(db, 'layer-1');
    expect(row).toBeDefined();
    expect(row!.id).toBe('layer-1');
    expect(row!.version).toBe('2026-05-02T00:00:00Z');
    expect(row!.geojson).toEqual(FC);
    expect(typeof row!.fetchedAt).toBe('string');
    expect(new Date(row!.fetchedAt).toString()).not.toBe('Invalid Date');
  });

  it('putCachedLayer overwrites an existing row (same id)', async () => {
    await putCachedLayer(db, 'layer-1', '2026-05-01T00:00:00Z', FC);
    await putCachedLayer(db, 'layer-1', '2026-05-02T00:00:00Z', FC);
    const row = await getCachedLayer(db, 'layer-1');
    expect(row!.version).toBe('2026-05-02T00:00:00Z');
    const all = await db.geo_layer_cache.toArray();
    expect(all.length).toBe(1);
  });

  it('bulkGetCachedLayers returns a Map of present entries, missing ids omitted', async () => {
    await putCachedLayer(db, 'a', 'v1', FC);
    await putCachedLayer(db, 'c', 'v3', FC);
    const map = await bulkGetCachedLayers(db, ['a', 'b', 'c']);
    expect(map.size).toBe(2);
    expect(map.get('a')!.version).toBe('v1');
    expect(map.get('c')!.version).toBe('v3');
    expect(map.has('b')).toBe(false);
  });

  it('bulkGetCachedLayers handles empty input', async () => {
    const map = await bulkGetCachedLayers(db, []);
    expect(map.size).toBe(0);
  });
});
