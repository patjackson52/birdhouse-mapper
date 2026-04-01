import { getOfflineDb } from './db';
import type { TileCacheMetadata } from './types';

interface TileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zoom: number;
}

interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

export function calculateTileBounds(bounds: LatLngBounds, zoom: number): TileBounds {
  const topLeft = latLngToTile(bounds.north, bounds.west, zoom);
  const bottomRight = latLngToTile(bounds.south, bounds.east, zoom);
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
    zoom,
  };
}

export function getTileUrls(tileBounds: TileBounds, tileUrlTemplate: string): string[] {
  const urls: string[] = [];
  for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
    for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
      urls.push(
        tileUrlTemplate
          .replace('{z}', String(tileBounds.zoom))
          .replace('{x}', String(x))
          .replace('{y}', String(y))
      );
    }
  }
  return urls;
}

export function estimateTileCount(bounds: LatLngBounds, zoomLevels: number[]): number {
  let total = 0;
  for (const zoom of zoomLevels) {
    const tb = calculateTileBounds(bounds, zoom);
    total += (tb.maxX - tb.minX + 1) * (tb.maxY - tb.minY + 1);
  }
  return total;
}

export function estimateDownloadSize(tileCount: number): string {
  const bytes = tileCount * 15000;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const DEFAULT_ZOOM_LEVELS = [13, 14, 15, 16, 17];

export async function predownloadTiles(
  propertyId: string,
  bounds: LatLngBounds,
  tileUrlTemplate: string,
  zoomLevels: number[] = DEFAULT_ZOOM_LEVELS,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const db = getOfflineDb();
  const cache = await caches.open('map-tiles');

  for (const zoom of zoomLevels) {
    const tileBounds = calculateTileBounds(bounds, zoom);
    const urls = getTileUrls(tileBounds, tileUrlTemplate);
    const metaId = `${propertyId}:${zoom}`;

    await db.tile_cache_metadata.put({
      id: metaId, property_id: propertyId, zoom, bounds,
      tile_count: urls.length, downloaded_count: 0, status: 'downloading',
    });

    let downloaded = 0;
    for (let i = 0; i < urls.length; i += 10) {
      const batch = urls.slice(i, i + 10);
      await Promise.all(batch.map(async (url) => {
        const existing = await cache.match(url);
        if (existing) { downloaded++; return; }
        try {
          const response = await fetch(url);
          if (response.ok) { await cache.put(url, response); }
        } catch { /* Individual tile failures are non-fatal */ }
        downloaded++;
      }));
      await db.tile_cache_metadata.update(metaId, { downloaded_count: downloaded });
      onProgress?.(downloaded, urls.length);
    }

    await db.tile_cache_metadata.update(metaId, { downloaded_count: downloaded, status: 'complete' });
  }
}

export async function getTileCacheStatus(propertyId: string): Promise<TileCacheMetadata[]> {
  const db = getOfflineDb();
  return db.tile_cache_metadata.where('property_id').equals(propertyId).toArray();
}

export async function clearTileCache(propertyId: string): Promise<void> {
  const db = getOfflineDb();
  const metadata = await db.tile_cache_metadata.where('property_id').equals(propertyId).toArray();
  const cache = await caches.open('map-tiles');
  for (const meta of metadata) {
    const urls = getTileUrls(calculateTileBounds(meta.bounds, meta.zoom), 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    for (const url of urls) { await cache.delete(url); }
  }
  await db.tile_cache_metadata.where('property_id').equals(propertyId).delete();
}
