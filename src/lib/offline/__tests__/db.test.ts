import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineDatabase } from '../db';
import 'fake-indexeddb/auto';

describe('OfflineDatabase', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase();
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
      'items',
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
    ]);
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
      status: 'active' as const,
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
      { id: 'a', name: 'A', org_id: 'org-1', property_id: 'prop-1', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active' as const, created_at: '', updated_at: '', created_by: null, description: null },
      { id: 'b', name: 'B', org_id: 'org-1', property_id: 'prop-2', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active' as const, created_at: '', updated_at: '', created_by: null, description: null },
      { id: 'c', name: 'C', org_id: 'org-1', property_id: 'prop-1', _synced_at: '', latitude: 0, longitude: 0, item_type_id: 't', custom_field_values: {}, status: 'active' as const, created_at: '', updated_at: '', created_by: null, description: null },
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
