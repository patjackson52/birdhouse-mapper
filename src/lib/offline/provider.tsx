'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { OfflineDatabase, getOfflineDb } from './db';
import { useNetworkStatus } from './network';
import { processOutboundQueue, syncPropertyData } from './sync-engine';
import { getPendingCount } from './mutations';
import { createClient } from '@/lib/supabase/client';
import * as store from './store';
import type { InsertItemParams, InsertItemUpdateParams } from './store';
import type { Item, ItemUpdate } from '@/lib/types';
import type { CachedRecord } from './types';

type Cached<T> = T & CachedRecord;

interface OfflineContextValue {
  db: OfflineDatabase;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  getItems: (propertyId: string) => ReturnType<typeof store.getItems>;
  getItem: (id: string) => ReturnType<typeof store.getItem>;
  getItemTypes: (orgId: string) => ReturnType<typeof store.getItemTypes>;
  getCustomFields: (orgId: string) => ReturnType<typeof store.getCustomFields>;
  getItemUpdates: (itemId: string) => ReturnType<typeof store.getItemUpdates>;
  getUpdateTypes: (orgId: string) => ReturnType<typeof store.getUpdateTypes>;
  getPhotos: (itemId: string) => ReturnType<typeof store.getPhotos>;
  getEntities: (orgId: string) => ReturnType<typeof store.getEntities>;
  getEntityTypes: (orgId: string) => ReturnType<typeof store.getEntityTypes>;
  insertItem: (params: InsertItemParams) => Promise<{ item: Cached<Item>; mutationId: string }>;
  updateItem: (itemId: string, changes: Record<string, unknown>, orgId: string, propertyId: string) => Promise<{ mutationId: string }>;
  deleteItem: (itemId: string, orgId: string, propertyId: string) => Promise<{ mutationId: string }>;
  insertItemUpdate: (params: InsertItemUpdateParams) => Promise<{ update: Cached<ItemUpdate>; mutationId: string }>;
  syncProperty: (propertyId: string, orgId: string) => Promise<void>;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const db = getOfflineDb();
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgress = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount(db);
    setPendingCount(count);
  }, [db]);

  const triggerSync = useCallback(async () => {
    if (syncInProgress.current || !isOnline) return;
    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await processOutboundQueue(db, supabase);
      await refreshPendingCount();
    } catch {
      // Sync failed — will retry on next trigger
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
    }
  }, [db, isOnline, refreshPendingCount]);

  const syncProperty = useCallback(async (propertyId: string, orgId: string) => {
    if (!isOnline) return;
    try {
      const supabase = createClient();
      await syncPropertyData(db, supabase, propertyId, orgId);
    } catch {
      // Inbound sync failed — stale data is still usable
    }
  }, [db, isOnline]);

  // Sync on connectivity change
  useEffect(() => {
    if (isOnline) { triggerSync(); }
  }, [isOnline, triggerSync]);

  // Sync on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isOnline) { triggerSync(); }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isOnline, triggerSync]);

  // Periodic sync every 5 minutes
  useEffect(() => {
    if (isOnline) {
      pollIntervalRef.current = setInterval(triggerSync, 5 * 60 * 1000);
    }
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [isOnline, triggerSync]);

  // Request persistent storage
  useEffect(() => {
    if (navigator.storage?.persist) { navigator.storage.persist(); }
  }, []);

  // Refresh pending count on mount
  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  const value: OfflineContextValue = {
    db, isOnline, pendingCount, isSyncing,
    getItems: (propertyId) => store.getItems(db, propertyId),
    getItem: (id) => store.getItem(db, id),
    getItemTypes: (orgId) => store.getItemTypes(db, orgId),
    getCustomFields: (orgId) => store.getCustomFields(db, orgId),
    getItemUpdates: (itemId) => store.getItemUpdates(db, itemId),
    getUpdateTypes: (orgId) => store.getUpdateTypes(db, orgId),
    getPhotos: (itemId) => store.getPhotos(db, itemId),
    getEntities: (orgId) => store.getEntities(db, orgId),
    getEntityTypes: (orgId) => store.getEntityTypes(db, orgId),
    insertItem: (params) => {
      const result = store.insertItem(db, params);
      result.then(() => { refreshPendingCount(); triggerSync(); });
      return result;
    },
    updateItem: (itemId, changes, orgId, propertyId) => {
      const result = store.updateItem(db, itemId, changes, orgId, propertyId);
      result.then(() => { refreshPendingCount(); triggerSync(); });
      return result;
    },
    deleteItem: (itemId, orgId, propertyId) => {
      const result = store.deleteItem(db, itemId, orgId, propertyId);
      result.then(() => { refreshPendingCount(); triggerSync(); });
      return result;
    },
    insertItemUpdate: (params) => {
      const result = store.insertItemUpdate(db, params);
      result.then(() => { refreshPendingCount(); triggerSync(); });
      return result;
    },
    syncProperty,
    triggerSync,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineStore(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOfflineStore must be used within an OfflineProvider');
  }
  return context;
}
