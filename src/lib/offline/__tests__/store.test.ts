import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OfflineDatabase } from '../db';
import {
  getItems,
  getItemTypes,
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
        { id: 't1', name: 'Birdhouse', icon: { set: 'emoji' as const, name: '🏠' }, color: '#000', sort_order: 1, layout: null, created_at: '', org_id: 'o1', _synced_at: '' },
        { id: 't2', name: 'Nest', icon: { set: 'emoji' as const, name: '🪺' }, color: '#fff', sort_order: 2, layout: null, created_at: '', org_id: 'o2', _synced_at: '' },
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

      const stored = await db.items.get(item.id);
      expect(stored).toBeDefined();
      expect(stored!.name).toBe('New House');

      const mutation = await db.mutation_queue.get(mutationId);
      expect(mutation).toBeDefined();
      expect(mutation!.table).toBe('items');
      expect(mutation!.operation).toBe('insert');
    });

    it('updateItem writes to IndexedDB and enqueues mutation', async () => {
      await db.items.put({
        id: 'item-1', name: 'Old', description: null, latitude: 0, longitude: 0,
        item_type_id: 't', custom_field_values: {}, status: 'active',
        created_at: '', updated_at: '', created_by: null, org_id: 'o', property_id: 'p', _synced_at: '',
      });

      const { mutationId } = await updateItem(db, 'item-1', { name: 'Updated', status: 'damaged' }, 'o', 'p');

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
