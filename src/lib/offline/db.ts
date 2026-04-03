import Dexie, { type EntityTable } from 'dexie';
import type {
  Item,
  ItemType,
  CustomField,
  ItemUpdate,
  UpdateType,
  UpdateTypeField,
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
  update_type_fields!: EntityTable<Cached<UpdateTypeField>, 'id'>;
  photos!: EntityTable<Cached<Photo>, 'id'>;
  entities!: EntityTable<Cached<Entity>, 'id'>;
  entity_types!: EntityTable<Cached<EntityType>, 'id'>;
  geo_layers!: EntityTable<Cached<Record<string, unknown>>, 'id'>;
  item_entities!: EntityTable<Cached<Record<string, unknown>>, 'id'>;
  update_entities!: EntityTable<Cached<Record<string, unknown>>, 'id'>;
  location_history!: EntityTable<Cached<Record<string, unknown>>, 'id'>;
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
      item_entities: 'id, item_id, entity_id, org_id',
      update_entities: 'id, update_id, entity_id, org_id',
      location_history: 'id, item_id, org_id, property_id',
      properties: 'id, org_id, slug',
      orgs: 'id, slug',
      roles: 'id, org_id',
      org_memberships: 'id, org_id, user_id',
      mutation_queue: 'id, status, created_at, table',
      photo_blobs: 'id, mutation_id, item_id',
      sync_metadata: 'id, property_id, table_name',
      tile_cache_metadata: 'id, property_id, zoom',
    });

    this.version(2).stores({
      update_type_fields: 'id, update_type_id, org_id',
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
