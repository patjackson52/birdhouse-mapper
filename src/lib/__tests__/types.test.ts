import { describe, it, expect } from 'vitest';
import type {
  Item, ItemType, CustomField, UpdateType, ItemUpdate,
  ItemWithDetails, Photo, ItemStatus, FieldType,
  EntityType, EntityTypeField, Entity, ItemEntity, UpdateEntity,
  EntityFieldType, EntityLinkTarget,
} from '../types';
import { iconDisplayName, normalizeIcon } from '../types';

describe('Item type structure', () => {
  it('accepts a valid Item object', () => {
    const item: Item = {
      id: '123',
      name: 'Test Box',
      description: 'A test item',
      latitude: 47.6,
      longitude: -122.5,
      item_type_id: 'type-1',
      custom_field_values: { 'field-1': 'Chickadee', 'field-2': 5 },
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      created_by: null,
      org_id: 'org-1',
      property_id: 'prop-1',
    };
    expect(item.name).toBe('Test Box');
    expect(item.custom_field_values['field-1']).toBe('Chickadee');
  });

  it('enforces ItemStatus values', () => {
    const validStatuses: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];
    expect(validStatuses).toHaveLength(4);
  });

  it('enforces FieldType values', () => {
    const validTypes: FieldType[] = ['text', 'number', 'dropdown', 'date'];
    expect(validTypes).toHaveLength(4);
  });
});

describe('ItemType structure', () => {
  it('accepts a valid ItemType', () => {
    const type: ItemType = {
      id: 'type-1',
      name: 'Bird Box',
      icon: { set: 'emoji', name: '🏠' },
      color: '#5D7F3A',
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
      org_id: 'org-1',
      layout: null,
    };
    expect(type.icon).toEqual({ set: 'emoji', name: '🏠' });
  });
});

describe('CustomField structure', () => {
  it('accepts a dropdown field with options', () => {
    const field: CustomField = {
      id: 'field-1',
      item_type_id: 'type-1',
      name: 'Target Species',
      field_type: 'dropdown',
      options: ['Chickadee', 'Swallow', 'Wren'],
      required: false,
      sort_order: 0,
      org_id: 'org-1',
    };
    expect(field.options).toHaveLength(3);
  });

  it('accepts a text field with null options', () => {
    const field: CustomField = {
      id: 'field-2',
      item_type_id: 'type-1',
      name: 'Notes',
      field_type: 'text',
      options: null,
      required: false,
      sort_order: 1,
      org_id: 'org-1',
    };
    expect(field.options).toBeNull();
  });
});

describe('UpdateType structure', () => {
  it('global update type has no item_type_id', () => {
    const ut: UpdateType = {
      id: 'ut-1',
      name: 'Maintenance',
      icon: '🔧',
      is_global: true,
      item_type_id: null,
      sort_order: 0,
      org_id: 'org-1',
      min_role_create: null,
      min_role_edit: null,
      min_role_delete: null,
    };
    expect(ut.is_global).toBe(true);
    expect(ut.item_type_id).toBeNull();
  });

  it('type-specific update type has item_type_id', () => {
    const ut: UpdateType = {
      id: 'ut-2',
      name: 'Bird Sighting',
      icon: '🐦',
      is_global: false,
      item_type_id: 'type-1',
      sort_order: 4,
      org_id: 'org-1',
      min_role_create: null,
      min_role_edit: null,
      min_role_delete: null,
    };
    expect(ut.is_global).toBe(false);
    expect(ut.item_type_id).toBe('type-1');
  });
});

describe('ItemWithDetails composite type', () => {
  it('assembles a full item with type, updates, photos, and custom fields', () => {
    const itemType: ItemType = {
      id: 'type-1', name: 'Bird Box', icon: { set: 'emoji', name: '🏠' }, color: '#5D7F3A',
      sort_order: 0, created_at: '2025-01-01T00:00:00Z', org_id: 'org-1', layout: null,
    };

    const updateType: UpdateType = {
      id: 'ut-1', name: 'Observation', icon: '👀',
      is_global: true, item_type_id: null, sort_order: 0, org_id: 'org-1',
      min_role_create: null, min_role_edit: null, min_role_delete: null,
    };

    const detailed: ItemWithDetails = {
      id: '123',
      name: 'Meadow Box',
      description: null,
      latitude: 47.6,
      longitude: -122.5,
      item_type_id: 'type-1',
      custom_field_values: { 'f1': 'Chickadee' },
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      created_by: null,
      org_id: 'org-1',
      property_id: 'prop-1',
      item_type: itemType,
      updates: [
        {
          id: 'upd-1',
          item_id: '123',
          update_type_id: 'ut-1',
          content: 'Saw a bird',
          update_date: '2025-04-01',
          created_at: '2025-04-01T00:00:00Z',
          created_by: null,
          anon_name: null,
          org_id: 'org-1',
          property_id: 'prop-1',
          custom_field_values: {},
          update_type: updateType,
          photos: [],
          entities: [],
        },
      ],
      photos: [],
      custom_fields: [
        {
          id: 'f1', item_type_id: 'type-1', name: 'Target Species',
          field_type: 'dropdown', options: ['Chickadee'], required: false, sort_order: 0, org_id: 'org-1',
        },
      ],
      entities: [],
    };

    expect(detailed.item_type.name).toBe('Bird Box');
    expect(detailed.updates).toHaveLength(1);
    expect(detailed.updates[0].update_type.icon).toBe('👀');
    expect(detailed.custom_fields).toHaveLength(1);
  });
});

describe('EntityType structure', () => {
  it('accepts a valid EntityType', () => {
    const et: EntityType = {
      id: 'et-1',
      org_id: 'org-1',
      name: 'Species',
      icon: { set: 'emoji', name: '🐦' },
      color: '#5D7F3A',
      link_to: ['items', 'updates'],
      sort_order: 0,
      api_source: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(et.name).toBe('Species');
    expect(et.link_to).toContain('items');
    expect(et.link_to).toContain('updates');
  });

  it('enforces EntityLinkTarget values', () => {
    const targets: EntityLinkTarget[] = ['items', 'updates'];
    expect(targets).toHaveLength(2);
  });

  it('enforces EntityFieldType values', () => {
    const types: EntityFieldType[] = ['text', 'number', 'dropdown', 'date', 'url'];
    expect(types).toHaveLength(5);
  });
});

describe('EntityTypeField structure', () => {
  it('accepts a text field', () => {
    const field: EntityTypeField = {
      id: 'etf-1',
      entity_type_id: 'et-1',
      org_id: 'org-1',
      name: 'Scientific Name',
      field_type: 'text',
      options: null,
      required: false,
      sort_order: 0,
    };
    expect(field.field_type).toBe('text');
    expect(field.options).toBeNull();
  });

  it('accepts a dropdown field with options', () => {
    const field: EntityTypeField = {
      id: 'etf-2',
      entity_type_id: 'et-1',
      org_id: 'org-1',
      name: 'Conservation Status',
      field_type: 'dropdown',
      options: ['LC', 'NT', 'VU', 'EN', 'CR'],
      required: false,
      sort_order: 1,
    };
    expect(field.options).toHaveLength(5);
  });

  it('accepts each field type', () => {
    const types: EntityFieldType[] = ['text', 'number', 'dropdown', 'date', 'url'];
    types.forEach((t) => {
      const field: EntityTypeField = {
        id: `etf-${t}`, entity_type_id: 'et-1', org_id: 'org-1',
        name: `Test ${t}`, field_type: t, options: null, required: false, sort_order: 0,
      };
      expect(field.field_type).toBe(t);
    });
  });
});

describe('Entity structure', () => {
  it('accepts a valid Entity', () => {
    const entity: Entity = {
      id: 'ent-1',
      entity_type_id: 'et-1',
      org_id: 'org-1',
      name: 'Black-capped Chickadee',
      description: 'Small songbird',
      photo_path: 'entities/ent-1/1710720000000.jpg',
      external_link: 'https://example.com/chickadee',
      external_id: null,
      custom_field_values: { 'etf-1': 'Poecile atricapillus', 'etf-2': 'LC' },
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(entity.name).toBe('Black-capped Chickadee');
    expect(entity.custom_field_values['etf-1']).toBe('Poecile atricapillus');
  });

  it('accepts nullable fields as null', () => {
    const entity: Entity = {
      id: 'ent-2',
      entity_type_id: 'et-1',
      org_id: 'org-1',
      name: 'Unknown',
      description: null,
      photo_path: null,
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(entity.description).toBeNull();
    expect(entity.photo_path).toBeNull();
  });
});

describe('Join table structures', () => {
  it('accepts ItemEntity', () => {
    const ie: ItemEntity = { item_id: 'item-1', entity_id: 'ent-1', org_id: 'org-1' };
    expect(ie.item_id).toBe('item-1');
    expect(ie.entity_id).toBe('ent-1');
  });

  it('accepts UpdateEntity', () => {
    const ue: UpdateEntity = { update_id: 'upd-1', entity_id: 'ent-1', org_id: 'org-1' };
    expect(ue.update_id).toBe('upd-1');
    expect(ue.entity_id).toBe('ent-1');
  });
});

describe('ItemWithDetails with entities', () => {
  it('includes entities on item and on updates', () => {
    const entityType: EntityType = {
      id: 'et-1', org_id: 'org-1', name: 'Species', icon: { set: 'emoji', name: '🐦' }, color: '#5D7F3A',
      link_to: ['items', 'updates'], sort_order: 0, api_source: null,
      created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    };

    const entity: Entity & { entity_type: EntityType } = {
      id: 'ent-1', entity_type_id: 'et-1', org_id: 'org-1',
      name: 'Chickadee', description: null, photo_path: null,
      external_link: null, external_id: null, custom_field_values: {}, sort_order: 0,
      created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
      entity_type: entityType,
    };

    const itemType: ItemType = {
      id: 'type-1', name: 'Bird Box', icon: { set: 'emoji', name: '🏠' }, color: '#5D7F3A',
      sort_order: 0, created_at: '2025-01-01T00:00:00Z', org_id: 'org-1', layout: null,
    };

    const updateType: UpdateType = {
      id: 'ut-1', name: 'Observation', icon: '👀',
      is_global: true, item_type_id: null, sort_order: 0, org_id: 'org-1',
      min_role_create: null, min_role_edit: null, min_role_delete: null,
    };

    const detailed: ItemWithDetails = {
      id: '123', name: 'Meadow Box', description: null,
      latitude: 47.6, longitude: -122.5, item_type_id: 'type-1',
      custom_field_values: {}, status: 'active',
      created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
      created_by: null, org_id: 'org-1', property_id: 'prop-1',
      item_type: itemType,
      updates: [{
        id: 'upd-1', item_id: '123', update_type_id: 'ut-1',
        content: 'Saw a bird', update_date: '2025-04-01',
        created_at: '2025-04-01T00:00:00Z', created_by: null,
        anon_name: null,
        org_id: 'org-1', property_id: 'prop-1',
        custom_field_values: {},
        update_type: updateType, photos: [], entities: [entity],
      }],
      photos: [],
      custom_fields: [],
      entities: [entity],
    };

    expect(detailed.entities).toHaveLength(1);
    expect(detailed.entities[0].name).toBe('Chickadee');
    expect(detailed.entities[0].entity_type.name).toBe('Species');
    expect(detailed.updates[0].entities).toHaveLength(1);
  });
});

describe('normalizeIcon', () => {
  it('passes a valid IconValue object through unchanged', () => {
    const icon = { set: 'lucide' as const, name: 'Home' };
    expect(normalizeIcon(icon)).toEqual(icon);
  });

  it('wraps a legacy string into an emoji IconValue', () => {
    expect(normalizeIcon('📍')).toEqual({ set: 'emoji', name: '📍' });
  });

  it('trims whitespace around legacy string icons', () => {
    expect(normalizeIcon('👀 ')).toEqual({ set: 'emoji', name: '👀' });
  });

  it('returns null for empty string, whitespace, null, or undefined', () => {
    expect(normalizeIcon('')).toBeNull();
    expect(normalizeIcon('   ')).toBeNull();
    expect(normalizeIcon(null)).toBeNull();
    expect(normalizeIcon(undefined)).toBeNull();
  });
});

describe('iconDisplayName', () => {
  it('returns the emoji character for emoji IconValues', () => {
    expect(iconDisplayName({ set: 'emoji', name: '📍' })).toBe('📍');
  });

  it('formats PascalCase lucide names with spaces', () => {
    expect(iconDisplayName({ set: 'lucide', name: 'HomeHeart' })).toBe('Home Heart');
  });

  it('handles legacy string icons without crashing (pre-migration 044 cache)', () => {
    expect(iconDisplayName('📍')).toBe('📍');
    expect(iconDisplayName('👀 ')).toBe('👀');
  });

  it('returns empty string for nullish inputs', () => {
    expect(iconDisplayName(null)).toBe('');
    expect(iconDisplayName(undefined)).toBe('');
  });
});
