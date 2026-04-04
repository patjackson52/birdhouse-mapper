import { describe, it, expect } from 'vitest';
import { generateMockItem } from '../mock-data';
import type { CustomField, ItemType } from '@/lib/types';

describe('generateMockItem', () => {
  const itemType: ItemType = {
    id: 't1',
    name: 'Bird Box',
    icon: '🏠',
    color: '#5D7F3A',
    sort_order: 0,
    created_at: '2026-01-01',
    org_id: 'o1',
    layout: null,
  };

  it('generates a mock item with correct type info', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.name).toBe('Sample Bird Box');
    expect(mock.item_type_id).toBe('t1');
    expect(mock.status).toBe('active');
    expect(mock.latitude).toBeTypeOf('number');
    expect(mock.longitude).toBeTypeOf('number');
  });

  it('generates mock values for text fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Notes', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Sample text');
  });

  it('generates mock values for number fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Count', field_type: 'number', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe(42);
  });

  it('generates first option for dropdown fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Robin');
  });

  it('generates today for date fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Installed', field_type: 'date', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe(new Date().toISOString().split('T')[0]);
  });

  it('includes mock photos', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.photos.length).toBeGreaterThan(0);
  });

  it('includes mock updates', () => {
    const mock = generateMockItem(itemType, []);
    expect(mock.updates.length).toBe(3);
  });
});
