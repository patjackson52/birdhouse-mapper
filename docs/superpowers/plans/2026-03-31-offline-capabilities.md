# Offline Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full offline support to BirdhouseMapper — background data caching, offline reads/writes, mutation queue with automatic sync, map tile pre-downloading, and PWA installability. The app works identically online and offline with no visible indicators.

**Architecture:** Dexie.js wraps IndexedDB as the local database, mirroring Supabase tables. All reads/writes go through an offline store abstraction. A mutation queue captures writes and syncs to Supabase when online. Serwist (Workbox) provides service worker management for app shell precaching and map tile caching. A sync engine handles bidirectional data flow with last-write-wins conflict resolution.

**Tech Stack:** Dexie.js, Serwist (@serwist/next), Workbox, Web Workers, Service Worker API, Cache API

**Spec:** `docs/superpowers/specs/2026-03-31-offline-capabilities-design.md`

---

## File Structure

### New Files

| Path | Responsibility |
|---|---|
| `src/lib/offline/db.ts` | Dexie database class, schema definition, versioning |
| `src/lib/offline/store.ts` | Data access functions — read from IndexedDB, write locally + enqueue |
| `src/lib/offline/mutations.ts` | Mutation queue CRUD operations |
| `src/lib/offline/sync-engine.ts` | Orchestrates inbound (server→client) and outbound (client→server) sync |
| `src/lib/offline/network.ts` | Connectivity detection, `useNetworkStatus()` hook |
| `src/lib/offline/tile-manager.ts` | Map tile pre-download, bounding box calculation, progress tracking |
| `src/lib/offline/photo-store.ts` | Local photo blob storage and upload |
| `src/lib/offline/provider.tsx` | React context — `OfflineProvider`, `useOfflineStore()` hook |
| `src/lib/offline/types.ts` | TypeScript interfaces for mutation records, sync metadata, etc. |
| `src/lib/offline/__tests__/db.test.ts` | Tests for Dexie schema and basic operations |
| `src/lib/offline/__tests__/store.test.ts` | Tests for offline store read/write functions |
| `src/lib/offline/__tests__/mutations.test.ts` | Tests for mutation queue operations |
| `src/lib/offline/__tests__/sync-engine.test.ts` | Tests for sync engine behavior |
| `src/lib/offline/__tests__/network.test.ts` | Tests for network status detection |
| `src/lib/offline/__tests__/tile-manager.test.ts` | Tests for tile download and cache management |
| `src/lib/offline/__tests__/photo-store.test.ts` | Tests for photo blob storage |
| `src/app/sw.ts` | Serwist service worker entry point |
| `src/app/api/manifest.json/route.ts` | Dynamic PWA manifest based on tenant |
| `src/app/manage/offline/page.tsx` | Cache management UI (download status, clear cache) |
| `src/components/manage/OfflineCacheManager.tsx` | Property cache status cards with download/clear actions |

### Modified Files

| Path | Change |
|---|---|
| `package.json` | Add dexie, serwist, @serwist/next |
| `next.config.js` | Integrate Serwist build plugin |
| `tsconfig.json` | Add `webworker` to lib for service worker types |
| `src/app/layout.tsx` | Wrap app in `OfflineProvider`, register service worker |
| `src/components/map/HomeMapView.tsx` | Replace Supabase queries with `useOfflineStore()` |
| `src/app/list/page.tsx` | Replace Supabase queries with `useOfflineStore()` |
| `src/components/manage/ItemForm.tsx` | Replace Supabase mutations with offline store writes |
| `src/components/manage/EditItemForm.tsx` | Replace Supabase mutations with offline store writes |
| `src/components/manage/UpdateForm.tsx` | Replace Supabase mutations with offline store writes |
| `src/lib/permissions/hooks.ts` | Fall back to cached permissions when offline |
| `src/components/map/MapView.tsx` | No code change — tiles auto-cached by service worker |
| `src/app/manage/layout.tsx` | Add link to offline cache management page |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install offline dependencies**

Run:
```bash
cd /Users/patrick/birdhousemapper && npm install dexie serwist @serwist/next
```

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dexie and serwist dependencies for offline support"
```

---

### Task 2: Offline Type Definitions

**Files:**
- Create: `src/lib/offline/types.ts`

- [ ] **Step 1: Create the types file**

Create `src/lib/offline/types.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/offline/types.ts
git commit -m "feat(offline): add type definitions for mutation queue, sync metadata, and photo blobs"
```

---

### Task 3: Dexie Database Schema

**Files:**
- Create: `src/lib/offline/db.ts`
- Test: `src/lib/offline/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test for database initialization**

Create `src/lib/offline/__tests__/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineDatabase } from '../db';

// Dexie uses fake-indexeddb in Node/test environments automatically
import 'fake-indexeddb/auto';

describe('OfflineDatabase', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    // Clear all tables between tests
    await db.delete();
    db = new OfflineDatabase();
  });

  it('should initialize with all expected tables', () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      'custom_fields',
      'entities',
      'entity_types',
      'geo_layers',
      'item_types',
      'item_updates',
      'mutation_queue',
      'org_memberships',
      'orgs',
      'photo_blobs',
      'photos',
      'properties',
      'roles',
      'sync_metadata',
      'tile_cache_metadata',
      'update_types',
      'items',
    ].sort());
  });

  it('should insert and retrieve an item by id', async () => {
    const item = {
      id: 'test-uuid-1',
      name: 'Test Birdhouse',
      description: null,
      latitude: 45.0,
      longitude: -93.0,
      item_type_id: 'type-1',
      custom_field_values: {},
      status: 'active',
      created_at: '2026-03-31T00:00:00Z',
      updated_at: '2026-03-31T00:00:00Z',
      created_by: null,
      org_id: 'org-1',
      property_id: 'prop-1',
      _synced_at: '2026-03-31T00:00:00Z',
    };

    await db.items.put(item);
    const retrieved = await db.items.get('test-uuid-1');
    expect(retrieved).toEqual(item);
  });

  it('should query items by property_id index', async () => {
    await db.items.bulkPut([
      { id: 'a', name: 'A', org_id: 'org-1', property_id: 'prop-1', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active', created_at: '', updated_at: '', created_by: null, description: null },
      { id: 'b', name: 'B', org_id: 'org-1', property_id: 'prop-2', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active', created_at: '', updated_at: '', created_by: null, description: null },
      { id: 'c', name: 'C', org_id: 'org-1', property_id: 'prop-1', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active', created_at: '', updated_at: '', created_by: null, description: null },
    ]);

    const prop1Items = await db.items.where('property_id').equals('prop-1').toArray();
    expect(prop1Items).toHaveLength(2);
    expect(prop1Items.map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('should insert and retrieve mutation queue records', async () => {
    const mutation = {
      id: 'mut-1',
      table: 'items',
      operation: 'insert' as const,
      record_id: 'item-1',
      payload: { name: 'New Item' },
      org_id: 'org-1',
      property_id: 'prop-1',
      created_at: Date.now(),
      status: 'pending' as const,
      retry_count: 0,
      error: null,
    };

    await db.mutation_queue.put(mutation);
    const pending = await db.mutation_queue.where('status').equals('pending').toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].table).toBe('items');
  });
});
```

- [ ] **Step 2: Install fake-indexeddb for tests**

Run:
```bash
cd /Users/patrick/birdhousemapper && npm install -D fake-indexeddb
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/lib/offline/__tests__/db.test.ts`
Expected: FAIL — `OfflineDatabase` does not exist.

- [ ] **Step 4: Implement the Dexie database**

Create `src/lib/offline/db.ts`:

```typescript
import Dexie, { type EntityTable } from 'dexie';
import type {
  Item,
  ItemType,
  CustomField,
  ItemUpdate,
  UpdateType,
  Photo,
  Entity,
  EntityType,
  Property,
  Org,
  Role,
  OrgMembership,
} from '@/lib/types';
import type {
  MutationRecord,
  PhotoBlob,
  SyncMetadata,
  TileCacheMetadata,
  CachedRecord,
} from './types';

type Cached<T> = T & CachedRecord;

export class OfflineDatabase extends Dexie {
  items!: EntityTable<Cached<Item>, 'id'>;
  item_types!: EntityTable<Cached<ItemType>, 'id'>;
  custom_fields!: EntityTable<Cached<CustomField>, 'id'>;
  item_updates!: EntityTable<Cached<ItemUpdate>, 'id'>;
  update_types!: EntityTable<Cached<UpdateType>, 'id'>;
  photos!: EntityTable<Cached<Photo>, 'id'>;
  entities!: EntityTable<Cached<Entity>, 'id'>;
  entity_types!: EntityTable<Cached<EntityType>, 'id'>;
  geo_layers!: EntityTable<Cached<Record<string, unknown>>, 'id'>;
  properties!: EntityTable<Cached<Property>, 'id'>;
  orgs!: EntityTable<Cached<Org>, 'id'>;
  roles!: EntityTable<Cached<Role>, 'id'>;
  org_memberships!: EntityTable<Cached<OrgMembership>, 'id'>;
  mutation_queue!: EntityTable<MutationRecord, 'id'>;
  photo_blobs!: EntityTable<PhotoBlob, 'id'>;
  sync_metadata!: EntityTable<SyncMetadata, 'id'>;
  tile_cache_metadata!: EntityTable<TileCacheMetadata, 'id'>;

  constructor() {
    super('birdhousemapper-offline');

    this.version(1).stores({
      items: 'id, org_id, property_id, item_type_id, status, created_at',
      item_types: 'id, org_id',
      custom_fields: 'id, item_type_id, org_id',
      item_updates: 'id, item_id, org_id, property_id, update_date',
      update_types: 'id, org_id',
      photos: 'id, item_id, update_id, org_id, property_id',
      entities: 'id, entity_type_id, org_id',
      entity_types: 'id, org_id',
      geo_layers: 'id, org_id, property_id',
      properties: 'id, org_id, slug',
      orgs: 'id, slug',
      roles: 'id, org_id',
      org_memberships: 'id, org_id, user_id',
      mutation_queue: 'id, status, created_at, table',
      photo_blobs: 'id, mutation_id, item_id',
      sync_metadata: 'id, property_id, table_name',
      tile_cache_metadata: 'id, property_id, zoom',
    });
  }
}

let dbInstance: OfflineDatabase | null = null;

export function getOfflineDb(): OfflineDatabase {
  if (!dbInstance) {
    dbInstance = new OfflineDatabase();
  }
  return dbInstance;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/db.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/db.ts src/lib/offline/__tests__/db.test.ts
git commit -m "feat(offline): add Dexie database schema with indexed tables mirroring Supabase"
```

---

### Task 4: Network Status Detection

**Files:**
- Create: `src/lib/offline/network.ts`
- Test: `src/lib/offline/__tests__/network.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/offline/__tests__/network.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus, checkConnectivity } from '../network';

describe('useNetworkStatus', () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onlineGetter = vi.spyOn(navigator, 'onLine', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true when browser reports online', () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('should return false when browser reports offline', () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('should update when online event fires', () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      onlineGetter.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('should update when offline event fires', () => {
    onlineGetter.mockReturnValue(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      onlineGetter.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);
  });
});

describe('checkConnectivity', () => {
  it('should return true when fetch succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const result = await checkConnectivity();
    expect(result).toBe(true);
  });

  it('should return false when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const result = await checkConnectivity();
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/offline/__tests__/network.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement network status**

Create `src/lib/offline/network.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const handleOnline = useCallback(() => setIsOnline(true), []);
  const handleOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline };
}

export async function checkConnectivity(): Promise<boolean> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/network.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/network.ts src/lib/offline/__tests__/network.test.ts
git commit -m "feat(offline): add network status hook and connectivity check"
```

---

### Task 5: Mutation Queue Operations

**Files:**
- Create: `src/lib/offline/mutations.ts`
- Test: `src/lib/offline/__tests__/mutations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/offline/__tests__/mutations.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import {
  enqueueMutation,
  getPendingMutations,
  markInFlight,
  markCompleted,
  markFailed,
  removeMutation,
} from '../mutations';

describe('Mutation Queue', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
  });

  it('should enqueue a mutation with pending status', async () => {
    const id = await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { name: 'Test' },
      org_id: 'org-1',
      property_id: 'prop-1',
    });

    const record = await db.mutation_queue.get(id);
    expect(record).toBeDefined();
    expect(record!.status).toBe('pending');
    expect(record!.retry_count).toBe(0);
    expect(record!.error).toBeNull();
  });

  it('should return pending mutations in FIFO order', async () => {
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation(db, { table: 'items', operation: 'update', record_id: 'b', payload: {}, org_id: 'o', property_id: 'p' });

    const pending = await getPendingMutations(db);
    expect(pending).toHaveLength(2);
    expect(pending[0].record_id).toBe('a');
    expect(pending[1].record_id).toBe('b');
  });

  it('should mark a mutation as in_flight', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markInFlight(db, id);

    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('in_flight');
  });

  it('should mark a mutation as completed', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markCompleted(db, id);

    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('completed');
  });

  it('should mark a mutation as failed with error and increment retry_count', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await markFailed(db, id, 'Network error');

    const record = await db.mutation_queue.get(id);
    expect(record!.status).toBe('failed');
    expect(record!.retry_count).toBe(1);
    expect(record!.error).toBe('Network error');
  });

  it('should remove a completed mutation', async () => {
    const id = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    await removeMutation(db, id);

    const record = await db.mutation_queue.get(id);
    expect(record).toBeUndefined();
  });

  it('should not return in_flight or completed mutations as pending', async () => {
    const id1 = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'a', payload: {}, org_id: 'o', property_id: 'p' });
    const id2 = await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'b', payload: {}, org_id: 'o', property_id: 'p' });
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'c', payload: {}, org_id: 'o', property_id: 'p' });

    await markInFlight(db, id1);
    await markCompleted(db, id2);

    const pending = await getPendingMutations(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].record_id).toBe('c');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/offline/__tests__/mutations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement mutation queue**

Create `src/lib/offline/mutations.ts`:

```typescript
import type { OfflineDatabase } from './db';
import type { MutationOperation, MutationRecord } from './types';

interface EnqueueParams {
  table: string;
  operation: MutationOperation;
  record_id: string;
  payload: Record<string, unknown>;
  org_id: string;
  property_id: string;
}

export async function enqueueMutation(
  db: OfflineDatabase,
  params: EnqueueParams
): Promise<string> {
  const id = crypto.randomUUID();
  const record: MutationRecord = {
    id,
    ...params,
    created_at: Date.now(),
    status: 'pending',
    retry_count: 0,
    error: null,
  };
  await db.mutation_queue.put(record);
  return id;
}

export async function getPendingMutations(
  db: OfflineDatabase
): Promise<MutationRecord[]> {
  return db.mutation_queue
    .where('status')
    .anyOf('pending', 'failed')
    .sortBy('created_at');
}

export async function markInFlight(
  db: OfflineDatabase,
  id: string
): Promise<void> {
  await db.mutation_queue.update(id, { status: 'in_flight' });
}

export async function markCompleted(
  db: OfflineDatabase,
  id: string
): Promise<void> {
  await db.mutation_queue.update(id, { status: 'completed' });
}

export async function markFailed(
  db: OfflineDatabase,
  id: string,
  error: string
): Promise<void> {
  const record = await db.mutation_queue.get(id);
  if (!record) return;
  await db.mutation_queue.update(id, {
    status: 'failed',
    retry_count: record.retry_count + 1,
    error,
  });
}

export async function removeMutation(
  db: OfflineDatabase,
  id: string
): Promise<void> {
  await db.mutation_queue.delete(id);
}

export async function getPendingCount(
  db: OfflineDatabase
): Promise<number> {
  return db.mutation_queue
    .where('status')
    .anyOf('pending', 'failed', 'in_flight')
    .count();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/mutations.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/mutations.ts src/lib/offline/__tests__/mutations.test.ts
git commit -m "feat(offline): add mutation queue CRUD operations with FIFO ordering"
```

---

### Task 6: Offline Data Store (Read/Write Abstraction)

**Files:**
- Create: `src/lib/offline/store.ts`
- Test: `src/lib/offline/__tests__/store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/offline/__tests__/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import {
  getItems,
  getItemTypes,
  getCustomFields,
  getItemUpdates,
  getUpdateTypes,
  getPhotos,
  getEntities,
  getEntityTypes,
  insertItem,
  updateItem,
  deleteItem,
  insertItemUpdate,
} from '../store';

describe('Offline Store', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
  });

  describe('reads', () => {
    it('getItems returns items for a property excluding removed', async () => {
      await db.items.bulkPut([
        { id: '1', name: 'A', org_id: 'o', property_id: 'p1', status: 'active', item_type_id: 't', custom_field_values: {}, latitude: 0, longitude: 0, created_at: '2026-01-01', updated_at: '2026-01-01', created_by: null, description: null, _synced_at: '' },
        { id: '2', name: 'B', org_id: 'o', property_id: 'p1', status: 'removed', item_type_id: 't', custom_field_values: {}, latitude: 0, longitude: 0, created_at: '2026-01-02', updated_at: '2026-01-02', created_by: null, description: null, _synced_at: '' },
        { id: '3', name: 'C', org_id: 'o', property_id: 'p2', status: 'active', item_type_id: 't', custom_field_values: {}, latitude: 0, longitude: 0, created_at: '2026-01-03', updated_at: '2026-01-03', created_by: null, description: null, _synced_at: '' },
      ]);

      const items = await getItems(db, 'p1');
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('1');
    });

    it('getItemTypes returns types for an org', async () => {
      await db.item_types.bulkPut([
        { id: 't1', name: 'Birdhouse', icon: '🏠', color: '#000', sort_order: 1, created_at: '', org_id: 'o1', _synced_at: '' },
        { id: 't2', name: 'Nest', icon: '🪺', color: '#fff', sort_order: 2, created_at: '', org_id: 'o2', _synced_at: '' },
      ]);

      const types = await getItemTypes(db, 'o1');
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('Birdhouse');
    });
  });

  describe('writes', () => {
    it('insertItem writes to IndexedDB and enqueues mutation', async () => {
      const { item, mutationId } = await insertItem(db, {
        name: 'New House',
        description: null,
        latitude: 45.0,
        longitude: -93.0,
        item_type_id: 'type-1',
        custom_field_values: {},
        status: 'active',
        org_id: 'org-1',
        property_id: 'prop-1',
      });

      // Item should be in IndexedDB
      const stored = await db.items.get(item.id);
      expect(stored).toBeDefined();
      expect(stored!.name).toBe('New House');

      // Mutation should be queued
      const mutation = await db.mutation_queue.get(mutationId);
      expect(mutation).toBeDefined();
      expect(mutation!.table).toBe('items');
      expect(mutation!.operation).toBe('insert');
    });

    it('updateItem writes to IndexedDB and enqueues mutation', async () => {
      // Seed an item
      await db.items.put({
        id: 'item-1', name: 'Old', description: null, latitude: 0, longitude: 0,
        item_type_id: 't', custom_field_values: {}, status: 'active',
        created_at: '', updated_at: '', created_by: null, org_id: 'o', property_id: 'p', _synced_at: '',
      });

      const { mutationId } = await updateItem(db, 'item-1', {
        name: 'Updated',
        status: 'damaged',
      }, 'o', 'p');

      const stored = await db.items.get('item-1');
      expect(stored!.name).toBe('Updated');
      expect(stored!.status).toBe('damaged');

      const mutation = await db.mutation_queue.get(mutationId);
      expect(mutation!.operation).toBe('update');
      expect(mutation!.payload).toEqual({ name: 'Updated', status: 'damaged' });
    });

    it('deleteItem soft-deletes in IndexedDB and enqueues mutation', async () => {
      await db.items.put({
        id: 'item-1', name: 'Doomed', description: null, latitude: 0, longitude: 0,
        item_type_id: 't', custom_field_values: {}, status: 'active',
        created_at: '', updated_at: '', created_by: null, org_id: 'o', property_id: 'p', _synced_at: '',
      });

      await deleteItem(db, 'item-1', 'o', 'p');

      const stored = await db.items.get('item-1');
      expect(stored!.status).toBe('removed');

      const pending = await db.mutation_queue.where('status').equals('pending').toArray();
      expect(pending).toHaveLength(1);
      expect(pending[0].operation).toBe('update');
      expect(pending[0].payload).toEqual({ status: 'removed' });
    });

    it('insertItemUpdate writes update and enqueues mutation', async () => {
      const { update, mutationId } = await insertItemUpdate(db, {
        item_id: 'item-1',
        update_type_id: 'ut-1',
        content: 'Found eggs!',
        update_date: '2026-03-31',
        org_id: 'org-1',
        property_id: 'prop-1',
      });

      const stored = await db.item_updates.get(update.id);
      expect(stored).toBeDefined();
      expect(stored!.content).toBe('Found eggs!');

      const mutation = await db.mutation_queue.get(mutationId);
      expect(mutation!.table).toBe('item_updates');
      expect(mutation!.operation).toBe('insert');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/offline/__tests__/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the offline store**

Create `src/lib/offline/store.ts`:

```typescript
import type { OfflineDatabase } from './db';
import type { Item, ItemType, CustomField, ItemUpdate, UpdateType, Photo, Entity, EntityType } from '@/lib/types';
import type { CachedRecord } from './types';
import { enqueueMutation } from './mutations';

type Cached<T> = T & CachedRecord;

// ---- Reads ----

export async function getItems(db: OfflineDatabase, propertyId: string): Promise<Cached<Item>[]> {
  const all = await db.items.where('property_id').equals(propertyId).toArray();
  return all
    .filter((i) => i.status !== 'removed')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getItem(db: OfflineDatabase, id: string): Promise<Cached<Item> | undefined> {
  return db.items.get(id);
}

export async function getItemTypes(db: OfflineDatabase, orgId: string): Promise<Cached<ItemType>[]> {
  const all = await db.item_types.where('org_id').equals(orgId).toArray();
  return all.sort((a, b) => a.sort_order - b.sort_order);
}

export async function getCustomFields(db: OfflineDatabase, orgId: string): Promise<Cached<CustomField>[]> {
  const all = await db.custom_fields.where('org_id').equals(orgId).toArray();
  return all.sort((a, b) => a.sort_order - b.sort_order);
}

export async function getItemUpdates(db: OfflineDatabase, itemId: string): Promise<Cached<ItemUpdate>[]> {
  const all = await db.item_updates.where('item_id').equals(itemId).toArray();
  return all.sort((a, b) => b.update_date.localeCompare(a.update_date));
}

export async function getUpdateTypes(db: OfflineDatabase, orgId: string): Promise<Cached<UpdateType>[]> {
  const all = await db.update_types.where('org_id').equals(orgId).toArray();
  return all.sort((a, b) => a.sort_order - b.sort_order);
}

export async function getPhotos(db: OfflineDatabase, itemId: string): Promise<Cached<Photo>[]> {
  return db.photos.where('item_id').equals(itemId).toArray();
}

export async function getUpdatePhotos(db: OfflineDatabase, updateId: string): Promise<Cached<Photo>[]> {
  return db.photos.where('update_id').equals(updateId).toArray();
}

export async function getEntities(db: OfflineDatabase, orgId: string): Promise<Cached<Entity>[]> {
  return db.entities.where('org_id').equals(orgId).toArray();
}

export async function getEntityTypes(db: OfflineDatabase, orgId: string): Promise<Cached<EntityType>[]> {
  return db.entity_types.where('org_id').equals(orgId).toArray();
}

// ---- Writes ----

interface InsertItemParams {
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  item_type_id: string;
  custom_field_values: Record<string, unknown>;
  status: string;
  org_id: string;
  property_id: string;
}

export async function insertItem(
  db: OfflineDatabase,
  params: InsertItemParams
): Promise<{ item: Cached<Item>; mutationId: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const item: Cached<Item> = {
    id,
    ...params,
    status: params.status as Item['status'],
    created_at: now,
    updated_at: now,
    created_by: null,
    _synced_at: '',
  };

  await db.items.put(item);

  const mutationId = await enqueueMutation(db, {
    table: 'items',
    operation: 'insert',
    record_id: id,
    payload: { ...params, id },
    org_id: params.org_id,
    property_id: params.property_id,
  });

  return { item, mutationId };
}

export async function updateItem(
  db: OfflineDatabase,
  itemId: string,
  changes: Record<string, unknown>,
  orgId: string,
  propertyId: string
): Promise<{ mutationId: string }> {
  await db.items.update(itemId, { ...changes, updated_at: new Date().toISOString() });

  const mutationId = await enqueueMutation(db, {
    table: 'items',
    operation: 'update',
    record_id: itemId,
    payload: changes,
    org_id: orgId,
    property_id: propertyId,
  });

  return { mutationId };
}

export async function deleteItem(
  db: OfflineDatabase,
  itemId: string,
  orgId: string,
  propertyId: string
): Promise<{ mutationId: string }> {
  // Soft delete — set status to 'removed'
  return updateItem(db, itemId, { status: 'removed' }, orgId, propertyId);
}

interface InsertItemUpdateParams {
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  org_id: string;
  property_id: string;
}

export async function insertItemUpdate(
  db: OfflineDatabase,
  params: InsertItemUpdateParams
): Promise<{ update: Cached<ItemUpdate>; mutationId: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const update: Cached<ItemUpdate> = {
    id,
    ...params,
    created_at: now,
    created_by: null,
    _synced_at: '',
  };

  await db.item_updates.put(update);

  const mutationId = await enqueueMutation(db, {
    table: 'item_updates',
    operation: 'insert',
    record_id: id,
    payload: { ...params, id },
    org_id: params.org_id,
    property_id: params.property_id,
  });

  return { update, mutationId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/store.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/store.ts src/lib/offline/__tests__/store.test.ts
git commit -m "feat(offline): add data store abstraction for reads and writes through IndexedDB"
```

---

### Task 7: Photo Blob Storage

**Files:**
- Create: `src/lib/offline/photo-store.ts`
- Test: `src/lib/offline/__tests__/photo-store.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/offline/__tests__/photo-store.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/offline/__tests__/photo-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement photo store**

Create `src/lib/offline/photo-store.ts`:

```typescript
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

export async function storePhotoBlob(
  db: OfflineDatabase,
  params: StorePhotoBlobParams
): Promise<string> {
  const id = crypto.randomUUID();
  const record: PhotoBlob = {
    id,
    ...params,
    created_at: Date.now(),
  };
  await db.photo_blobs.put(record);
  return id;
}

export async function getPhotoBlobs(
  db: OfflineDatabase,
  mutationId: string
): Promise<PhotoBlob[]> {
  return db.photo_blobs.where('mutation_id').equals(mutationId).toArray();
}

export async function getPhotoBlobsByItem(
  db: OfflineDatabase,
  itemId: string
): Promise<PhotoBlob[]> {
  return db.photo_blobs.where('item_id').equals(itemId).toArray();
}

export async function removePhotoBlob(
  db: OfflineDatabase,
  id: string
): Promise<void> {
  await db.photo_blobs.delete(id);
}

export async function removePhotoBlobsByMutation(
  db: OfflineDatabase,
  mutationId: string
): Promise<void> {
  await db.photo_blobs.where('mutation_id').equals(mutationId).delete();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/photo-store.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/photo-store.ts src/lib/offline/__tests__/photo-store.test.ts
git commit -m "feat(offline): add photo blob storage for offline-captured photos"
```

---

### Task 8: Sync Engine — Outbound (Client to Server)

**Files:**
- Create: `src/lib/offline/sync-engine.ts`
- Test: `src/lib/offline/__tests__/sync-engine.test.ts`

- [ ] **Step 1: Write failing tests for outbound sync**

Create `src/lib/offline/__tests__/sync-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import { enqueueMutation } from '../mutations';
import { processOutboundQueue } from '../sync-engine';

// Mock Supabase client
const mockFrom = vi.fn();
const mockStorage = { from: vi.fn() };
const mockSupabase = {
  from: mockFrom,
  storage: mockStorage,
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
};

describe('Sync Engine — Outbound', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
    await db.delete();
    db = new OfflineDatabase();
    vi.clearAllMocks();
  });

  it('should process pending insert mutations via Supabase', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'item-1' }, error: null }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Mutation should be removed from queue
    const remaining = await db.mutation_queue.toArray();
    expect(remaining).toHaveLength(0);
  });

  it('should process pending update mutations', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue({ update: updateMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'update',
      record_id: 'item-1',
      payload: { name: 'Updated' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Updated' });
  });

  it('should mark mutations as failed on error and increment retry', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'RLS violation' } }) }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    await enqueueMutation(db, {
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1', name: 'Test' },
      org_id: 'o',
      property_id: 'p',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.failed).toBe(1);

    const mutations = await db.mutation_queue.toArray();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].status).toBe('failed');
    expect(mutations[0].retry_count).toBe(1);
    expect(mutations[0].error).toBe('RLS violation');
  });

  it('should skip mutations that exceed max retries', async () => {
    await db.mutation_queue.put({
      id: 'mut-1',
      table: 'items',
      operation: 'insert',
      record_id: 'item-1',
      payload: { id: 'item-1' },
      org_id: 'o',
      property_id: 'p',
      created_at: Date.now(),
      status: 'failed',
      retry_count: 5,
      error: 'Permanent error',
    });

    const result = await processOutboundQueue(db, mockSupabase as any);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('should process mutations in FIFO order', async () => {
    const callOrder: string[] = [];
    mockFrom.mockImplementation((table: string) => ({
      insert: (payload: any) => {
        callOrder.push(payload.id || payload[0]?.id);
        return { select: () => ({ single: () => Promise.resolve({ data: payload, error: null }) }) };
      },
    }));

    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'first', payload: { id: 'first' }, org_id: 'o', property_id: 'p' });
    await new Promise((r) => setTimeout(r, 5));
    await enqueueMutation(db, { table: 'items', operation: 'insert', record_id: 'second', payload: { id: 'second' }, org_id: 'o', property_id: 'p' });

    await processOutboundQueue(db, mockSupabase as any);
    expect(callOrder).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/offline/__tests__/sync-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement outbound sync**

Create `src/lib/offline/sync-engine.ts`:

```typescript
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
    const storagePath = `${photoBlob.item_id}/${Date.now()}_${photoBlob.filename}`;
    const { error: uploadError } = await supabase.storage
      .from('item-photos')
      .upload(storagePath, photoBlob.blob);

    if (uploadError) {
      return `Photo upload failed: ${uploadError.message}`;
    }

    // Insert photo record
    const { error: photoInsertError } = await supabase.from('photos').insert({
      item_id: photoBlob.item_id,
      update_id: photoBlob.update_id,
      storage_path: storagePath,
      is_primary: photoBlob.is_primary,
    });

    if (photoInsertError) {
      return `Photo record insert failed: ${photoInsertError.message}`;
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
      const { error } = await supabase
        .from(mutation.table)
        .delete()
        .eq('id', mutation.record_id);
      return error ? error.message : null;
    }
    default:
      return `Unknown operation: ${mutation.operation}`;
  }
}

// ---- Inbound Sync (Server → Client) ----

const SYNC_TABLES = [
  'items',
  'item_types',
  'custom_fields',
  'item_updates',
  'update_types',
  'photos',
  'entities',
  'entity_types',
  'geo_layers',
  'properties',
  'orgs',
  'roles',
  'org_memberships',
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

    // Build query — scope by org_id or property_id depending on table
    let query = supabase.from(tableName).select('*');

    // Tables scoped by property
    const propertyScoped = ['items', 'item_updates', 'photos', 'geo_layers'];
    // Tables scoped by org only
    const orgScoped = ['item_types', 'custom_fields', 'update_types', 'entities', 'entity_types', 'roles', 'org_memberships'];

    if (propertyScoped.includes(tableName)) {
      query = query.eq('property_id', propertyId);
    } else if (orgScoped.includes(tableName)) {
      query = query.eq('org_id', orgId);
    } else if (tableName === 'properties') {
      query = query.eq('id', propertyId);
    } else if (tableName === 'orgs') {
      query = query.eq('id', orgId);
    }

    // Delta sync — only fetch records updated since last sync
    query = query.gte('updated_at', lastSynced);

    const { data, error } = await query;

    if (error) {
      await db.sync_metadata.put({
        id: metaId,
        property_id: propertyId,
        table_name: tableName,
        last_synced_at: meta?.last_synced_at || '',
        record_count: meta?.record_count || 0,
        status: 'error',
      });
      continue;
    }

    if (data && data.length > 0) {
      const withSyncedAt = data.map((record: Record<string, unknown>) => ({
        ...record,
        _synced_at: now,
      }));

      // Bulk upsert into local DB
      const table = db.table(tableName);
      await table.bulkPut(withSyncedAt);
    }

    // Update sync metadata
    const totalCount = await db.table(tableName).count();
    await db.sync_metadata.put({
      id: metaId,
      property_id: propertyId,
      table_name: tableName,
      last_synced_at: now,
      record_count: totalCount,
      status: 'fresh',
    });
  }

  // Discard local pending mutations that conflict with newer server data
  const pendingMutations = await db.mutation_queue
    .where('status')
    .anyOf('pending', 'failed')
    .toArray();

  for (const mutation of pendingMutations) {
    if (mutation.property_id !== propertyId) continue;

    const serverRecord = await db.table(mutation.table).get(mutation.record_id);
    if (serverRecord && serverRecord._synced_at > new Date(mutation.created_at).toISOString()) {
      // Server has a newer version — discard local mutation
      await db.mutation_queue.delete(mutation.id);
      await db.photo_blobs.where('mutation_id').equals(mutation.id).delete();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/sync-engine.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/sync-engine.ts src/lib/offline/__tests__/sync-engine.test.ts
git commit -m "feat(offline): add sync engine with outbound queue processing and inbound delta sync"
```

---

### Task 9: Offline Provider (React Context)

**Files:**
- Create: `src/lib/offline/provider.tsx`

- [ ] **Step 1: Implement the provider**

Create `src/lib/offline/provider.tsx`:

```typescript
'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { OfflineDatabase, getOfflineDb } from './db';
import { useNetworkStatus } from './network';
import { processOutboundQueue, syncPropertyData } from './sync-engine';
import { getPendingCount } from './mutations';
import { createClient } from '@/lib/supabase/client';
import * as store from './store';

interface OfflineContextValue {
  db: OfflineDatabase;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  // Read operations
  getItems: (propertyId: string) => ReturnType<typeof store.getItems>;
  getItem: (id: string) => ReturnType<typeof store.getItem>;
  getItemTypes: (orgId: string) => ReturnType<typeof store.getItemTypes>;
  getCustomFields: (orgId: string) => ReturnType<typeof store.getCustomFields>;
  getItemUpdates: (itemId: string) => ReturnType<typeof store.getItemUpdates>;
  getUpdateTypes: (orgId: string) => ReturnType<typeof store.getUpdateTypes>;
  getPhotos: (itemId: string) => ReturnType<typeof store.getPhotos>;
  getEntities: (orgId: string) => ReturnType<typeof store.getEntities>;
  getEntityTypes: (orgId: string) => ReturnType<typeof store.getEntityTypes>;
  // Write operations
  insertItem: typeof store.insertItem extends (db: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
  updateItem: typeof store.updateItem extends (db: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
  deleteItem: typeof store.deleteItem extends (db: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
  insertItemUpdate: typeof store.insertItemUpdate extends (db: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never;
  // Sync
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

      // Check auth — if session is expired, skip sync
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      // Process outbound queue
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
    if (isOnline) {
      triggerSync();
    }
  }, [isOnline, triggerSync]);

  // Sync on visibility change (tab foregrounded)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isOnline) {
        triggerSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isOnline, triggerSync]);

  // Periodic sync every 5 minutes while online
  useEffect(() => {
    if (isOnline) {
      pollIntervalRef.current = setInterval(triggerSync, 5 * 60 * 1000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOnline, triggerSync]);

  // Refresh pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  const value: OfflineContextValue = {
    db,
    isOnline,
    pendingCount,
    isSyncing,
    // Bind db to store functions
    getItems: (propertyId) => store.getItems(db, propertyId),
    getItem: (id) => store.getItem(db, id),
    getItemTypes: (orgId) => store.getItemTypes(db, orgId),
    getCustomFields: (orgId) => store.getCustomFields(db, orgId),
    getItemUpdates: (itemId) => store.getItemUpdates(db, itemId),
    getUpdateTypes: (orgId) => store.getUpdateTypes(db, orgId),
    getPhotos: (itemId) => store.getPhotos(db, itemId),
    getEntities: (orgId) => store.getEntities(db, orgId),
    getEntityTypes: (orgId) => store.getEntityTypes(db, orgId),
    insertItem: (...args) => {
      const result = store.insertItem(db, ...args);
      result.then(() => {
        refreshPendingCount();
        triggerSync();
      });
      return result;
    },
    updateItem: (...args) => {
      const result = store.updateItem(db, ...args);
      result.then(() => {
        refreshPendingCount();
        triggerSync();
      });
      return result;
    },
    deleteItem: (...args) => {
      const result = store.deleteItem(db, ...args);
      result.then(() => {
        refreshPendingCount();
        triggerSync();
      });
      return result;
    },
    insertItemUpdate: (...args) => {
      const result = store.insertItemUpdate(db, ...args);
      result.then(() => {
        refreshPendingCount();
        triggerSync();
      });
      return result;
    },
    syncProperty,
    triggerSync,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOfflineStore(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOfflineStore must be used within an OfflineProvider');
  }
  return context;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new type errors from offline module.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offline/provider.tsx
git commit -m "feat(offline): add OfflineProvider context with auto-sync and data access methods"
```

---

### Task 10: Service Worker Setup (Serwist)

**Files:**
- Create: `src/app/sw.ts`
- Modify: `next.config.js`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the service worker entry point**

Create `src/app/sw.ts`:

```typescript
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, CacheFirst, ExpirationPlugin, NetworkFirst } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Map tiles — Cache-First with LRU expiration
    {
      matcher: ({ url }) => {
        return (
          url.hostname.includes('tile.openstreetmap.org') ||
          url.hostname.includes('basemaps.cartocdn.com') ||
          url.hostname.includes('tiles.stadiamaps.com') ||
          url.hostname.includes('server.arcgisonline.com') ||
          url.hostname.includes('stamen-tiles.a.ssl.fastly.net')
        );
      },
      handler: new CacheFirst({
        cacheName: 'map-tiles',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30000, // ~450MB at ~15KB/tile
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          }),
        ],
      }),
    },
    // Supabase Storage (photos) — Network-First, no pre-cache
    {
      matcher: ({ url }) => {
        return url.hostname.includes('supabase.co') && url.pathname.includes('/storage/');
      },
      handler: new NetworkFirst({
        cacheName: 'supabase-storage',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          }),
        ],
      }),
    },
    // Default cache rules from Serwist for everything else
    ...defaultCache,
  ],
});

serwist.addEventListeners();
```

- [ ] **Step 2: Update next.config.js to integrate Serwist**

Read the current `next.config.js` and wrap it with `withSerwist`:

Modify `next.config.js`:

```javascript
const withSerwist = require('@serwist/next').default({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = withSerwist(nextConfig);
```

- [ ] **Step 3: Add service worker registration to root layout**

Read `src/app/layout.tsx` and add the service worker registration. Add this inside the `<body>` tag, before the closing `</body>`:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `,
  }}
/>
```

Also wrap the app's children in `<OfflineProvider>`:

```tsx
import { OfflineProvider } from '@/lib/offline/provider';
```

And wrap the children:
```tsx
<OfflineProvider>
  {children}
</OfflineProvider>
```

- [ ] **Step 4: Add tsconfig lib entry for service worker types**

Modify `tsconfig.json` — add `"webworker"` to the `compilerOptions.lib` array:

```json
"lib": ["dom", "dom.iterable", "esnext", "webworker"]
```

- [ ] **Step 5: Verify build works**

Run: `npm run build`
Expected: Build succeeds. Service worker generated at `public/sw.js`.

- [ ] **Step 6: Commit**

```bash
git add src/app/sw.ts next.config.js src/app/layout.tsx tsconfig.json
git commit -m "feat(offline): add Serwist service worker with tile caching and app shell precaching"
```

---

### Task 11: Tile Pre-Download Manager

**Files:**
- Create: `src/lib/offline/tile-manager.ts`
- Test: `src/lib/offline/__tests__/tile-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/offline/__tests__/tile-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateTileBounds, getTileUrls } from '../tile-manager';

describe('Tile Manager', () => {
  describe('calculateTileBounds', () => {
    it('should return tile coordinates for a bounding box at a zoom level', () => {
      // Small area in Minneapolis
      const bounds = { north: 44.98, south: 44.97, east: -93.26, west: -93.28 };
      const tiles = calculateTileBounds(bounds, 15);

      expect(tiles.minX).toBeLessThan(tiles.maxX);
      expect(tiles.minY).toBeLessThan(tiles.maxY);
      expect(tiles.zoom).toBe(15);
    });

    it('should return more tiles at higher zoom levels', () => {
      const bounds = { north: 44.98, south: 44.97, east: -93.26, west: -93.28 };
      const tiles14 = calculateTileBounds(bounds, 14);
      const tiles16 = calculateTileBounds(bounds, 16);

      const count14 = (tiles14.maxX - tiles14.minX + 1) * (tiles14.maxY - tiles14.minY + 1);
      const count16 = (tiles16.maxX - tiles16.minX + 1) * (tiles16.maxY - tiles16.minY + 1);

      expect(count16).toBeGreaterThan(count14);
    });
  });

  describe('getTileUrls', () => {
    it('should generate OSM tile URLs for a tile range', () => {
      const urls = getTileUrls(
        { minX: 0, maxX: 1, minY: 0, maxY: 1, zoom: 10 },
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      );

      expect(urls).toHaveLength(4); // 2x2 grid
      expect(urls[0]).toBe('https://tile.openstreetmap.org/10/0/0.png');
      expect(urls[3]).toBe('https://tile.openstreetmap.org/10/1/1.png');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/offline/__tests__/tile-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tile manager**

Create `src/lib/offline/tile-manager.ts`:

```typescript
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
  const bytes = tileCount * 15000; // ~15KB average per tile
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
      id: metaId,
      property_id: propertyId,
      zoom,
      bounds,
      tile_count: urls.length,
      downloaded_count: 0,
      status: 'downloading',
    });

    let downloaded = 0;

    // Download in batches of 10 to avoid overwhelming the network
    for (let i = 0; i < urls.length; i += 10) {
      const batch = urls.slice(i, i + 10);

      await Promise.all(
        batch.map(async (url) => {
          // Skip if already cached
          const existing = await cache.match(url);
          if (existing) {
            downloaded++;
            return;
          }

          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Individual tile failures are non-fatal
          }
          downloaded++;
        })
      );

      await db.tile_cache_metadata.update(metaId, { downloaded_count: downloaded });
      onProgress?.(downloaded, urls.length);
    }

    await db.tile_cache_metadata.update(metaId, {
      downloaded_count: downloaded,
      status: 'complete',
    });
  }
}

export async function getTileCacheStatus(
  propertyId: string
): Promise<TileCacheMetadata[]> {
  const db = getOfflineDb();
  return db.tile_cache_metadata.where('property_id').equals(propertyId).toArray();
}

export async function clearTileCache(propertyId: string): Promise<void> {
  const db = getOfflineDb();
  const metadata = await db.tile_cache_metadata.where('property_id').equals(propertyId).toArray();

  const cache = await caches.open('map-tiles');

  for (const meta of metadata) {
    const urls = getTileUrls(
      calculateTileBounds(meta.bounds, meta.zoom),
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    );
    for (const url of urls) {
      await cache.delete(url);
    }
  }

  await db.tile_cache_metadata.where('property_id').equals(propertyId).delete();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/offline/__tests__/tile-manager.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/tile-manager.ts src/lib/offline/__tests__/tile-manager.test.ts
git commit -m "feat(offline): add tile pre-download manager with bounding box calculation"
```

---

### Task 12: PWA Dynamic Manifest

**Files:**
- Create: `src/app/api/manifest.json/route.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the dynamic manifest route**

Create `src/app/api/manifest.json/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/server';

export async function GET(request: NextRequest) {
  const config = await getConfig(request.headers);

  const manifest = {
    name: config.siteName || 'BirdhouseMapper',
    short_name: config.siteName?.slice(0, 12) || 'BirdMapper',
    description: config.tagline || 'Field mapping for conservation teams',
    start_url: '/map',
    display: 'standalone' as const,
    orientation: 'any' as const,
    theme_color: '#2563eb',
    background_color: '#ffffff',
    icons: [
      {
        src: config.logoUrl || '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: config.logoUrl || '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: config.logoUrl || '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 2: Add manifest link to root layout**

In `src/app/layout.tsx`, add to the `<head>`:

```tsx
<link rel="manifest" href="/api/manifest.json" />
<meta name="theme-color" content="#2563eb" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

- [ ] **Step 3: Create default PWA icons**

Run:
```bash
mkdir -p /Users/patrick/birdhousemapper/public/icons
```

Note: Actual icon files (icon-192.png, icon-512.png, icon-512-maskable.png) should be created from the app logo. For now, create placeholder files — these will be replaced with real icons before launch.

```bash
# Create simple placeholder SVG converted to a note file
echo "TODO: Generate PWA icons from app logo at 192x192, 512x512, and 512x512 maskable sizes" > /Users/patrick/birdhousemapper/public/icons/README.md
```

- [ ] **Step 4: Request persistent storage in the provider**

In `src/lib/offline/provider.tsx`, add inside the `OfflineProvider` component, after the existing `useEffect` hooks:

```typescript
// Request persistent storage on first load
useEffect(() => {
  if (navigator.storage?.persist) {
    navigator.storage.persist();
  }
}, []);
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/manifest.json/route.ts src/app/layout.tsx public/icons/README.md src/lib/offline/provider.tsx
git commit -m "feat(offline): add dynamic PWA manifest and persistent storage request"
```

---

### Task 13: Refactor HomeMapView to Use Offline Store

**Files:**
- Modify: `src/components/map/HomeMapView.tsx`

- [ ] **Step 1: Read the current HomeMapView**

Read `src/components/map/HomeMapView.tsx` to understand the exact current implementation.

- [ ] **Step 2: Replace Supabase queries with offline store**

Replace the data fetching `useEffect` that calls `createClient()` and queries Supabase. The current pattern (lines ~69-98):

```typescript
// OLD: Direct Supabase queries
const supabase = createClient();
const [itemRes, typeRes, fieldRes, userRes] = await Promise.all([
  supabase.from("items").select("*").neq("status", "removed").order("created_at", { ascending: true }),
  supabase.from("item_types").select("*").order("sort_order", { ascending: true }),
  supabase.from("custom_fields").select("*").order("sort_order", { ascending: true }),
  supabase.auth.getUser(),
]);
```

Replace with:

```typescript
// NEW: Offline store reads
import { useOfflineStore } from '@/lib/offline/provider';

// Inside the component:
const { getItems, getItemTypes, getCustomFields, syncProperty } = useOfflineStore();

// In the data fetch useEffect:
const [items, types, fields] = await Promise.all([
  getItems(propertyId),
  getItemTypes(orgId),
  getCustomFields(orgId),
]);

// Trigger background sync for this property
syncProperty(propertyId, orgId);
```

Also update the detail panel fetch (~lines 169-216) to use offline store reads:

```typescript
const freshItem = await getItem(item.id);
const [updates, photos, updateTypes] = await Promise.all([
  getItemUpdates(item.id),
  getPhotos(item.id),
  getUpdateTypes(orgId),
]);
```

Remove the `import { createClient } from '@/lib/supabase/client'` if no longer used.

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Run existing tests**

Run: `npm run test -- --run`
Expected: Existing tests still pass (may need mock updates for `useOfflineStore`).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/HomeMapView.tsx
git commit -m "refactor(offline): replace direct Supabase queries with offline store in HomeMapView"
```

---

### Task 14: Refactor List Page to Use Offline Store

**Files:**
- Modify: `src/app/list/page.tsx`

- [ ] **Step 1: Read the current list page**

Read `src/app/list/page.tsx` to understand the current implementation.

- [ ] **Step 2: Replace Supabase queries with offline store**

Replace the data fetch (lines ~24-41):

```typescript
// OLD
const supabase = createClient();
const [itemRes, typeRes, fieldRes] = await Promise.all([
  supabase.from('items').select('*').order('name', { ascending: true }),
  supabase.from('item_types').select('*').order('sort_order', { ascending: true }),
  supabase.from('custom_fields').select('*').order('sort_order', { ascending: true }),
]);
```

With:

```typescript
// NEW
const { getItems, getItemTypes, getCustomFields } = useOfflineStore();

const [items, types, fields] = await Promise.all([
  getItems(propertyId),
  getItemTypes(orgId),
  getCustomFields(orgId),
]);
```

Note: The list page currently sorts by name. Add a `.sort((a, b) => a.name.localeCompare(b.name))` after `getItems()` since the offline store sorts by `created_at`.

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/list/page.tsx
git commit -m "refactor(offline): replace direct Supabase queries with offline store in list page"
```

---

### Task 15: Refactor ItemForm (Create) to Use Offline Store

**Files:**
- Modify: `src/components/manage/ItemForm.tsx`

- [ ] **Step 1: Read the current ItemForm**

Read `src/components/manage/ItemForm.tsx` to understand the current mutation pattern.

- [ ] **Step 2: Replace Supabase insert with offline store write**

Replace the item creation logic (lines ~112-155). The current pattern:

```typescript
const { data: item, error: insertError } = await supabase
  .from('items')
  .insert({ name, description, latitude, longitude, item_type_id, custom_field_values, status })
  .select()
  .single();
```

With:

```typescript
const { insertItem } = useOfflineStore();

const { item } = await insertItem({
  name,
  description: description || null,
  latitude,
  longitude,
  item_type_id: selectedTypeId,
  custom_field_values: cfValues,
  status,
  org_id: orgId,
  property_id: propertyId,
});
```

For photo uploads, use the photo blob store when offline:

```typescript
import { storePhotoBlob } from '@/lib/offline/photo-store';
import { getOfflineDb } from '@/lib/offline/db';

// Store photos locally — they'll be uploaded during sync
const db = getOfflineDb();
for (let i = 0; i < photos.length; i++) {
  await storePhotoBlob(db, {
    mutation_id: mutationId,
    blob: photos[i],
    filename: `${Date.now()}_${i}.jpg`,
    item_id: item.id,
    update_id: null,
    is_primary: i === 0,
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Run existing ItemForm tests**

Run: `npm run test -- src/components/manage/__tests__/ItemForm.test.ts --run`
Expected: Tests pass (may need mock updates).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/ItemForm.tsx
git commit -m "refactor(offline): replace Supabase mutations with offline store in ItemForm"
```

---

### Task 16: Refactor EditItemForm to Use Offline Store

**Files:**
- Modify: `src/components/manage/EditItemForm.tsx`

- [ ] **Step 1: Read the current EditItemForm**

Read `src/components/manage/EditItemForm.tsx` to understand the current update/delete patterns.

- [ ] **Step 2: Replace Supabase mutations with offline store writes**

Replace the item update (lines ~182-195):

```typescript
// OLD
const { error: updateError } = await supabase
  .from('items')
  .update({ name, description, latitude, longitude, item_type_id, custom_field_values, status })
  .eq('id', itemId);
```

With:

```typescript
// NEW
const { updateItem } = useOfflineStore();

await updateItem(itemId, {
  name,
  description: description || null,
  latitude,
  longitude,
  item_type_id: selectedTypeId,
  custom_field_values: cfValues,
  status,
}, orgId, propertyId);
```

Also replace location history insert, entity upsert, photo removal, and new photo uploads with the equivalent offline store operations. For location history:

```typescript
if (latitude !== originalLatitude || longitude !== originalLongitude) {
  // Enqueue as a separate mutation
  const db = getOfflineDb();
  await enqueueMutation(db, {
    table: 'location_history',
    operation: 'insert',
    record_id: crypto.randomUUID(),
    payload: { item_id: itemId, latitude, longitude, created_by: userId },
    org_id: orgId,
    property_id: propertyId,
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/manage/EditItemForm.tsx
git commit -m "refactor(offline): replace Supabase mutations with offline store in EditItemForm"
```

---

### Task 17: Refactor UpdateForm to Use Offline Store

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx`

- [ ] **Step 1: Read the current UpdateForm**

Read `src/components/manage/UpdateForm.tsx` to understand the current pattern.

- [ ] **Step 2: Replace Supabase insert with offline store write**

Replace the update creation (lines ~142-179):

```typescript
// OLD
const { data: update, error: insertError } = await supabase
  .from('item_updates')
  .insert({ item_id: itemId, update_type_id: updateTypeId, content: content || null, update_date: updateDate })
  .select()
  .single();
```

With:

```typescript
// NEW
const { insertItemUpdate } = useOfflineStore();

const { update, mutationId } = await insertItemUpdate({
  item_id: itemId,
  update_type_id: updateTypeId,
  content: content || null,
  update_date: updateDate,
  org_id: orgId,
  property_id: propertyId,
});
```

Replace photo uploads with offline blob store (same pattern as Task 15, but with `update_id: update.id`).

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Run existing UpdateForm tests**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.ts --run`
Expected: Tests pass (may need mock updates).

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/UpdateForm.tsx
git commit -m "refactor(offline): replace Supabase mutations with offline store in UpdateForm"
```

---

### Task 18: Refactor Permissions Hook for Offline

**Files:**
- Modify: `src/lib/permissions/hooks.ts`

- [ ] **Step 1: Read the current permissions hook**

Read `src/lib/permissions/hooks.ts`.

- [ ] **Step 2: Add offline fallback**

The hook currently fetches `users`, `org_memberships`, and `roles` from Supabase. Modify it to try Supabase first, and fall back to cached data from IndexedDB:

```typescript
import { getOfflineDb } from '@/lib/offline/db';

// Inside fetchPermissions():
try {
  // Existing Supabase fetch logic...
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // ... rest of current implementation ...

  // Cache the resolved permissions for offline use
  if (user && membership) {
    const db = getOfflineDb();
    await db.org_memberships.put({ ...membership, _synced_at: new Date().toISOString() });
  }
} catch {
  // Offline fallback — read from cached membership/role
  const db = getOfflineDb();
  const cachedMemberships = await db.org_memberships.toArray();
  if (cachedMemberships.length > 0) {
    const membership = cachedMemberships[0];
    const role = await db.roles.get(membership.role_id);
    if (role) {
      // Extract permissions from cached role
      setPermissions(extractPermissions(role));
    }
  }
  setLoading(false);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/permissions/hooks.ts
git commit -m "refactor(offline): add IndexedDB fallback to permissions hook"
```

---

### Task 19: Cache Management UI

**Files:**
- Create: `src/app/manage/offline/page.tsx`
- Create: `src/components/manage/OfflineCacheManager.tsx`

- [ ] **Step 1: Create the cache manager component**

Create `src/components/manage/OfflineCacheManager.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOfflineStore } from '@/lib/offline/provider';
import { getOfflineDb } from '@/lib/offline/db';
import {
  predownloadTiles,
  getTileCacheStatus,
  clearTileCache,
  estimateTileCount,
  estimateDownloadSize,
} from '@/lib/offline/tile-manager';
import type { Property } from '@/lib/types';
import type { SyncMetadata } from '@/lib/offline/types';

interface PropertyCacheStatus {
  property: Property;
  syncMeta: SyncMetadata[];
  tileStatus: string;
  isDownloading: boolean;
}

export function OfflineCacheManager({ orgId, properties }: { orgId: string; properties: Property[] }) {
  const { syncProperty, isOnline } = useOfflineStore();
  const [statuses, setStatuses] = useState<PropertyCacheStatus[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ used: string; available: string } | null>(null);

  const refreshStatuses = useCallback(async () => {
    const db = getOfflineDb();
    const results: PropertyCacheStatus[] = [];

    for (const property of properties) {
      const syncMeta = await db.sync_metadata
        .where('property_id')
        .equals(property.id)
        .toArray();

      const tileMeta = await getTileCacheStatus(property.id);
      const tileStatus = tileMeta.length === 0
        ? 'Not cached'
        : tileMeta.every((t) => t.status === 'complete')
          ? 'Cached'
          : 'Downloading...';

      results.push({
        property,
        syncMeta,
        tileStatus,
        isDownloading: false,
      });
    }

    setStatuses(results);
  }, [properties]);

  useEffect(() => {
    refreshStatuses();

    // Get storage estimate
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

    // Sync data
    await syncProperty(property.id, orgId);

    // Pre-download tiles if property has map bounds
    if (property.map_default_lat && property.map_default_lng) {
      const bounds = {
        north: property.map_default_lat + 0.05,
        south: property.map_default_lat - 0.05,
        east: property.map_default_lng + 0.05,
        west: property.map_default_lng - 0.05,
      };

      // Use the property's tile URL or default to OSM
      const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      await predownloadTiles(property.id, bounds, tileUrl, [13, 14, 15, 16, 17]);
    }

    await refreshStatuses();
  };

  const handleClearProperty = async (propertyId: string) => {
    const db = getOfflineDb();

    // Clear data tables for this property
    const tables = ['items', 'item_updates', 'photos', 'geo_layers'] as const;
    for (const table of tables) {
      await db.table(table).where('property_id').equals(propertyId).delete();
    }

    // Clear sync metadata
    await db.sync_metadata.where('property_id').equals(propertyId).delete();

    // Clear tile cache
    await clearTileCache(propertyId);

    await refreshStatuses();
  };

  const handleDownloadAll = async () => {
    for (const property of properties) {
      await handleDownloadProperty(property);
    }
  };

  const getCacheAge = (syncMeta: SyncMetadata[]): string => {
    if (syncMeta.length === 0) return 'Not cached';
    const oldest = syncMeta.reduce((min, m) =>
      m.last_synced_at < min.last_synced_at ? m : min
    );
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
          <p className="text-sm text-gray-600">
            Using {storageEstimate.used} of {storageEstimate.available}
          </p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-medium">Properties</h3>
        {isOnline && (
          <button onClick={handleDownloadAll} className="btn-secondary text-sm">
            Download All
          </button>
        )}
      </div>

      <div className="space-y-3">
        {statuses.map(({ property, syncMeta, tileStatus }) => (
          <div key={property.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{property.name}</p>
              <p className="text-sm text-gray-500">
                Data: {getCacheAge(syncMeta)} | Tiles: {tileStatus}
              </p>
            </div>
            <div className="flex gap-2">
              {isOnline && (
                <button
                  onClick={() => handleDownloadProperty(property)}
                  className="btn-primary text-sm"
                >
                  Download
                </button>
              )}
              <button
                onClick={() => handleClearProperty(property.id)}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
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
```

- [ ] **Step 2: Create the page**

Create `src/app/manage/offline/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useConfig } from '@/lib/config/client';
import { useOfflineStore } from '@/lib/offline/provider';
import { OfflineCacheManager } from '@/components/manage/OfflineCacheManager';
import type { Property } from '@/lib/types';

export default function OfflinePage() {
  const config = useConfig();
  const { db } = useOfflineStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => {
    async function loadProperties() {
      const orgs = await db.orgs.toArray();
      if (orgs.length > 0) {
        setOrgId(orgs[0].id);
      }
      const props = await db.properties.toArray();
      setProperties(props);
    }
    loadProperties();
  }, [db]);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Offline Data</h1>
      <p className="text-gray-600 mb-6">
        Download data for offline use in the field. Cached data and maps will be
        available without an internet connection.
      </p>
      {orgId && (
        <OfflineCacheManager orgId={orgId} properties={properties} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/manage/offline/page.tsx src/components/manage/OfflineCacheManager.tsx
git commit -m "feat(offline): add cache management UI for downloading and clearing property data"
```

---

### Task 20: Auto-Cache Current Property on Navigation

**Files:**
- Modify: `src/lib/offline/provider.tsx`

- [ ] **Step 1: Add auto-sync trigger**

In the `OfflineProvider`, add a mechanism to sync the current property when the user navigates to it. Add a new exposed function and a `useEffect` that watches the config's `propertyId`:

```typescript
import { useConfig } from '@/lib/config/client';

// Inside OfflineProvider:
const config = useConfig();

// Auto-sync current property
useEffect(() => {
  if (config.propertyId && isOnline) {
    // Get org ID from cached orgs
    db.orgs.toArray().then((orgs) => {
      if (orgs.length > 0) {
        syncProperty(config.propertyId!, orgs[0].id);
      }
    });
  }
}, [config.propertyId, isOnline, syncProperty, db]);
```

- [ ] **Step 2: Verify build**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offline/provider.tsx
git commit -m "feat(offline): auto-sync current property data on navigation"
```

---

### Task 21: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests pass. If any fail due to missing mocks for `useOfflineStore`, update those test files to mock `@/lib/offline/provider`.

Common mock pattern:
```typescript
vi.mock('@/lib/offline/provider', () => ({
  useOfflineStore: () => ({
    getItems: vi.fn().mockResolvedValue([]),
    getItemTypes: vi.fn().mockResolvedValue([]),
    getCustomFields: vi.fn().mockResolvedValue([]),
    // ... other methods as needed
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    syncProperty: vi.fn(),
    triggerSync: vi.fn(),
  }),
}));
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds. Service worker generated.

- [ ] **Step 4: Fix any failures**

Address test failures, type errors, or build issues discovered in steps 1-3. Commit fixes individually with descriptive messages.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(offline): resolve integration issues from offline refactor"
```

---

### Task 22: Refactor Remaining Admin Components

**Files:**
- Multiple files in `src/app/admin/` and `src/components/`

This task covers the remaining ~35 files that import `createClient` from the browser client. These are primarily admin pages (property management, member management, roles, entity types, geo layers, etc.).

- [ ] **Step 1: Identify all remaining files**

Run a search for all files importing `@/lib/supabase/client` and list them. For each file:

1. Read the file to understand its Supabase queries and mutations.
2. Add the needed read/write functions to `store.ts` if not already present (e.g., `getProperties()`, `getRoles()`, `getOrgMemberships()`, `updateProperty()`, etc.).
3. Replace `createClient()` calls with `useOfflineStore()`.

Priority order:
- `src/app/manage/page.tsx` (dashboard stats)
- `src/app/manage/layout.tsx` (auth check)
- `src/components/layout/Navigation.tsx` (auth state)
- `src/components/manage/EntitySelect.tsx` (entity picker in forms)
- `src/components/manage/LocationHistory.tsx` (location history display)
- Admin pages (lower priority — these are less likely to be used offline but should still work)

- [ ] **Step 2: Add missing store functions**

Add to `src/lib/offline/store.ts` as needed:

```typescript
export async function getProperties(db: OfflineDatabase, orgId: string): Promise<Cached<Property>[]> {
  return db.properties.where('org_id').equals(orgId).toArray();
}

export async function getProperty(db: OfflineDatabase, id: string): Promise<Cached<Property> | undefined> {
  return db.properties.get(id);
}

export async function getRoles(db: OfflineDatabase, orgId: string): Promise<Cached<Role>[]> {
  return db.roles.where('org_id').equals(orgId).toArray();
}

export async function getOrgMemberships(db: OfflineDatabase, orgId: string): Promise<Cached<OrgMembership>[]> {
  return db.org_memberships.where('org_id').equals(orgId).toArray();
}

export async function getGeoLayers(db: OfflineDatabase, propertyId: string): Promise<Record<string, unknown>[]> {
  return db.geo_layers.where('property_id').equals(propertyId).toArray();
}

export async function updateProperty(
  db: OfflineDatabase,
  propertyId: string,
  changes: Record<string, unknown>,
  orgId: string
): Promise<{ mutationId: string }> {
  await db.properties.update(propertyId, { ...changes, updated_at: new Date().toISOString() });
  const mutationId = await enqueueMutation(db, {
    table: 'properties',
    operation: 'update',
    record_id: propertyId,
    payload: changes,
    org_id: orgId,
    property_id: propertyId,
  });
  return { mutationId };
}
```

- [ ] **Step 3: Refactor each file**

For each file, apply the same pattern as Tasks 13-18:
- Replace `createClient()` + Supabase queries with `useOfflineStore()` methods.
- Replace Supabase mutations with offline store writes.
- Remove unused `createClient` imports.

- [ ] **Step 4: Verify build and tests**

Run: `npm run type-check && npm run test -- --run && npm run build`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(offline): migrate remaining components to offline store"
```

---

## Summary

| Task | What It Builds | Key Files |
|---|---|---|
| 1 | Install dependencies | `package.json` |
| 2 | Type definitions | `offline/types.ts` |
| 3 | Dexie database schema | `offline/db.ts` |
| 4 | Network status detection | `offline/network.ts` |
| 5 | Mutation queue CRUD | `offline/mutations.ts` |
| 6 | Data store (read/write) | `offline/store.ts` |
| 7 | Photo blob storage | `offline/photo-store.ts` |
| 8 | Sync engine | `offline/sync-engine.ts` |
| 9 | React context/provider | `offline/provider.tsx` |
| 10 | Service worker (Serwist) | `sw.ts`, `next.config.js` |
| 11 | Tile pre-download | `offline/tile-manager.ts` |
| 12 | PWA manifest | `api/manifest.json/route.ts` |
| 13 | Refactor: HomeMapView | `HomeMapView.tsx` |
| 14 | Refactor: List page | `list/page.tsx` |
| 15 | Refactor: ItemForm | `ItemForm.tsx` |
| 16 | Refactor: EditItemForm | `EditItemForm.tsx` |
| 17 | Refactor: UpdateForm | `UpdateForm.tsx` |
| 18 | Refactor: Permissions | `permissions/hooks.ts` |
| 19 | Cache management UI | `manage/offline/page.tsx` |
| 20 | Auto-cache on navigation | `offline/provider.tsx` |
| 21 | Integration verification | All files |
| 22 | Remaining admin refactors | ~35 admin/component files |

Tasks 1-12 build the offline infrastructure. Tasks 13-18 refactor core user-facing components. Tasks 19-20 add the cache management UX. Tasks 21-22 ensure everything integrates and cover remaining files.
