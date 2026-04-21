import type { OfflineDatabase } from './db';
import type { Item, ItemType, CustomField, ItemUpdate, UpdateType, UpdateTypeField, Photo, Entity, EntityType } from '@/lib/types';
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

export async function getUpdateTypeFields(db: OfflineDatabase, orgId: string): Promise<Cached<UpdateTypeField>[]> {
  const all = await db.update_type_fields.where('org_id').equals(orgId).toArray();
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

export interface InsertItemParams {
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
  return updateItem(db, itemId, { status: 'removed' }, orgId, propertyId);
}

export interface InsertItemUpdateParams {
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  org_id: string;
  property_id: string;
  custom_field_values?: Record<string, unknown>;
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
    custom_field_values: params.custom_field_values ?? {},
    created_at: now,
    created_by: null,
    anon_name: null,
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
