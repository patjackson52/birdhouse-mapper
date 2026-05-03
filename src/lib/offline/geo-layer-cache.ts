import type { OfflineDatabase } from './db';
import type { FeatureCollection } from 'geojson';

export interface CachedLayer {
  id: string;
  version: string;
  geojson: FeatureCollection;
  fetchedAt: string;
}

export async function getCachedLayer(
  db: OfflineDatabase,
  id: string,
): Promise<CachedLayer | undefined> {
  return (await db.geo_layer_cache.get(id)) as CachedLayer | undefined;
}

export async function putCachedLayer(
  db: OfflineDatabase,
  id: string,
  version: string,
  geojson: FeatureCollection,
): Promise<void> {
  await db.geo_layer_cache.put({
    id,
    version,
    geojson,
    fetchedAt: new Date().toISOString(),
  });
}

export async function bulkGetCachedLayers(
  db: OfflineDatabase,
  ids: string[],
): Promise<Map<string, CachedLayer>> {
  const map = new Map<string, CachedLayer>();
  if (ids.length === 0) return map;
  const rows = (await db.geo_layer_cache.bulkGet(ids)) as (CachedLayer | undefined)[];
  for (let i = 0; i < ids.length; i++) {
    const row = rows[i];
    if (row) map.set(ids[i], row);
  }
  return map;
}
