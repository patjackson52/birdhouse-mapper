'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOfflineStore } from '@/lib/offline/provider';
import { getOfflineDb } from '@/lib/offline/db';
import {
  predownloadTiles,
  getTileCacheStatus,
  clearTileCache,
} from '@/lib/offline/tile-manager';
import type { Property } from '@/lib/types';
import type { SyncMetadata } from '@/lib/offline/types';

interface PropertyCacheStatus {
  property: Property;
  syncMeta: SyncMetadata[];
  tileStatus: string;
}

export function OfflineCacheManager({ orgId, properties }: { orgId: string; properties: Property[] }) {
  const { syncProperty, isOnline } = useOfflineStore();
  const [statuses, setStatuses] = useState<PropertyCacheStatus[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ used: string; available: string } | null>(null);

  const refreshStatuses = useCallback(async () => {
    const db = getOfflineDb();
    const results: PropertyCacheStatus[] = [];

    for (const property of properties) {
      const syncMeta = await db.sync_metadata.where('property_id').equals(property.id).toArray();
      const tileMeta = await getTileCacheStatus(property.id);
      const tileStatus = tileMeta.length === 0
        ? 'Not cached'
        : tileMeta.every((t) => t.status === 'complete') ? 'Cached' : 'Downloading...';
      results.push({ property, syncMeta, tileStatus });
    }
    setStatuses(results);
  }, [properties]);

  useEffect(() => {
    refreshStatuses();
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        setStorageEstimate({
          used: formatBytes(estimate.usage || 0),
          available: formatBytes(estimate.quota || 0),
        });
      });
    }
  }, [refreshStatuses]);

  const handleDownloadProperty = async (property: Property) => {
    if (!isOnline) return;
    await syncProperty(property.id, orgId);
    if (property.map_default_lat && property.map_default_lng) {
      const bounds = {
        north: property.map_default_lat + 0.05,
        south: property.map_default_lat - 0.05,
        east: property.map_default_lng + 0.05,
        west: property.map_default_lng - 0.05,
      };
      await predownloadTiles(property.id, bounds, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', [13, 14, 15, 16, 17]);
    }
    await refreshStatuses();
  };

  const handleClearProperty = async (propertyId: string) => {
    const db = getOfflineDb();
    const tables = ['items', 'item_updates', 'photos', 'geo_layers'] as const;
    for (const table of tables) { await db.table(table).where('property_id').equals(propertyId).delete(); }
    await db.sync_metadata.where('property_id').equals(propertyId).delete();
    await clearTileCache(propertyId);
    await refreshStatuses();
  };

  const handleDownloadAll = async () => {
    for (const property of properties) { await handleDownloadProperty(property); }
  };

  const getCacheAge = (syncMeta: SyncMetadata[]): string => {
    if (syncMeta.length === 0) return 'Not cached';
    const oldest = syncMeta.reduce((min, m) => m.last_synced_at < min.last_synced_at ? m : min);
    const age = Date.now() - new Date(oldest.last_synced_at).getTime();
    const hours = Math.floor(age / (1000 * 60 * 60));
    if (hours < 1) return 'Just synced';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {storageEstimate && (
        <div className="card">
          <h3 className="font-medium mb-2">Storage</h3>
          <p className="text-sm text-gray-600">Using {storageEstimate.used} of {storageEstimate.available}</p>
        </div>
      )}
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Properties</h3>
        {isOnline && <button onClick={handleDownloadAll} className="btn-secondary text-sm">Download All</button>}
      </div>
      <div className="space-y-3">
        {statuses.map(({ property, syncMeta, tileStatus }) => (
          <div key={property.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{property.name}</p>
              <p className="text-sm text-gray-500">Data: {getCacheAge(syncMeta)} | Tiles: {tileStatus}</p>
            </div>
            <div className="flex gap-2">
              {isOnline && <button onClick={() => handleDownloadProperty(property)} className="btn-primary text-sm">Download</button>}
              <button onClick={() => handleClearProperty(property.id)} className="btn-secondary text-sm">Clear</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
