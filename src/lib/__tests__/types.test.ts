import { describe, it, expect } from 'vitest';
import type {
  Item, ItemType, CustomField, UpdateType, ItemUpdate,
  ItemWithDetails, Photo, ItemStatus, FieldType,
} from '../types';

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
      icon: '🏠',
      color: '#5D7F3A',
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(type.icon).toBe('🏠');
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
    };
    expect(ut.is_global).toBe(false);
    expect(ut.item_type_id).toBe('type-1');
  });
});

describe('ItemWithDetails composite type', () => {
  it('assembles a full item with type, updates, photos, and custom fields', () => {
    const itemType: ItemType = {
      id: 'type-1', name: 'Bird Box', icon: '🏠', color: '#5D7F3A',
      sort_order: 0, created_at: '2025-01-01T00:00:00Z',
    };

    const updateType: UpdateType = {
      id: 'ut-1', name: 'Observation', icon: '👀',
      is_global: true, item_type_id: null, sort_order: 0,
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
          update_type: updateType,
          photos: [],
        },
      ],
      photos: [],
      custom_fields: [
        {
          id: 'f1', item_type_id: 'type-1', name: 'Target Species',
          field_type: 'dropdown', options: ['Chickadee'], required: false, sort_order: 0,
        },
      ],
    };

    expect(detailed.item_type.name).toBe('Bird Box');
    expect(detailed.updates).toHaveLength(1);
    expect(detailed.updates[0].update_type.icon).toBe('👀');
    expect(detailed.custom_fields).toHaveLength(1);
  });
});
