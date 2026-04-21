import { describe, it, expect } from 'vitest';
import { enrichUpdates } from '../enrichUpdates';
import type { AuthorCard, Entity, EntityType, ItemUpdate, Photo, UpdateType, UpdateTypeField } from '@/lib/types';

const updateType: UpdateType = {
  id: 'ut-1', org_id: 'o1', name: 'Nest check', icon: '🐣',
  is_global: true, item_type_id: null, sort_order: 0,
  min_role_create: null, min_role_edit: null, min_role_delete: null,
};

const birdEntityType: EntityType = { id: 'et-bird', org_id: 'o1', name: 'Bird', icon: '🐦', api_source: 'inaturalist' as any } as any;
const otherEntityType: EntityType = { id: 'et-other', org_id: 'o1', name: 'Plant', icon: '🌱', api_source: null as any } as any;

const birdEntity: Entity & { entity_type: EntityType } = {
  id: 'e-bird', org_id: 'o1', entity_type_id: 'et-bird', name: 'Eastern Bluebird',
  external_id: 14886 as any, photo_url: 'bluebird.png',
  native: true, cavity_nester: true,
  entity_type: birdEntityType,
} as any;

const plantEntity: Entity & { entity_type: EntityType } = {
  id: 'e-plant', org_id: 'o1', entity_type_id: 'et-other', name: 'Oak',
  external_id: null as any, photo_url: null,
  entity_type: otherEntityType,
} as any;

const baseUpdate = (overrides: Partial<ItemUpdate> = {}): ItemUpdate => ({
  id: 'u1', item_id: 'i1', update_type_id: 'ut-1', content: 'hi',
  update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
  created_by: 'user-a', org_id: 'o1', property_id: 'p1',
  custom_field_values: {},
  anon_name: null,
  ...overrides,
});

const authorCards: Map<string, AuthorCard> = new Map([
  ['user-a', { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 5 }],
  ['user-b', { id: 'user-b', display_name: 'Bob', avatar_url: null, role: 'public_contributor', update_count: 1 }],
]);

describe('enrichUpdates', () => {
  it('maps update_type and filters species entities by api_source', () => {
    const out = enrichUpdates({
      updates: [baseUpdate()],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map([['u1', [birdEntity, plantEntity]]]),
      authorCards,
    });
    expect(out).toHaveLength(1);
    expect(out[0].update_type.name).toBe('Nest check');
    expect(out[0].species).toHaveLength(1);
    expect(out[0].species[0].external_id).toBe(14886);
    expect(out[0].species[0].common_name).toBe('Eastern Bluebird');
  });

  it('attaches createdByProfile for members', () => {
    const out = enrichUpdates({
      updates: [baseUpdate()],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].createdByProfile?.display_name).toBe('Alice');
    expect(out[0].createdByProfile?.role).toBe('contributor');
  });

  it('attaches createdByProfile for public contributors (anon variants key off role)', () => {
    const out = enrichUpdates({
      updates: [baseUpdate({ created_by: 'user-b', anon_name: 'BirdFan42' })],
      updateTypes: [updateType],
      updateTypeFields: [],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].createdByProfile?.role).toBe('public_contributor');
    expect(out[0].anon_name).toBe('BirdFan42');
  });

  it('flattens custom_field_values to {label, value} using update type fields', () => {
    const field: UpdateTypeField = {
      id: 'f1', update_type_id: 'ut-1', org_id: 'o1', name: 'Outcome',
      field_type: 'text', options: null, required: false, sort_order: 0,
    };
    const out = enrichUpdates({
      updates: [baseUpdate({ custom_field_values: { f1: 'fledged' } })],
      updateTypes: [updateType],
      updateTypeFields: [field],
      photosByUpdateId: new Map(),
      entitiesByUpdateId: new Map(),
      authorCards,
    });
    expect(out[0].fields).toEqual([{ label: 'Outcome', value: 'fledged' }]);
  });
});
