import { describe, it, expect } from 'vitest';
import { generateDefaultLayout } from '../defaults';
import type { CustomField } from '@/lib/types';
import type { LayoutBlock } from '../types';

describe('generateDefaultLayout', () => {
  it('generates starter layout with no custom fields', () => {
    const layout = generateDefaultLayout([]);
    expect(layout.version).toBe(1);
    expect(layout.spacing).toBe('comfortable');
    expect(layout.peekBlockCount).toBe(2);
    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0].type).toBe('status_badge');
    expect(layout.blocks[1].type).toBe('photo_gallery');
    expect(layout.blocks[2].type).toBe('action_buttons');
  });

  it('inserts field_display blocks for each custom field', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin'], required: true, sort_order: 0, org_id: 'o1' },
      { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    expect(layout.blocks).toHaveLength(5);
    expect(layout.blocks[2].type).toBe('field_display');
    expect(layout.blocks[3].type).toBe('field_display');
    const config0 = (layout.blocks[2] as LayoutBlock).config as { fieldId: string };
    const config1 = (layout.blocks[3] as LayoutBlock).config as { fieldId: string };
    expect(config0.fieldId).toBe('f1');
    expect(config1.fieldId).toBe('f2');
  });

  it('sorts fields by sort_order', () => {
    const fields: CustomField[] = [
      { id: 'f2', item_type_id: 't1', name: 'B', field_type: 'text', options: null, required: false, sort_order: 2, org_id: 'o1' },
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    const config0 = (layout.blocks[2] as LayoutBlock).config as { fieldId: string };
    const config1 = (layout.blocks[3] as LayoutBlock).config as { fieldId: string };
    expect(config0.fieldId).toBe('f1');
    expect(config1.fieldId).toBe('f2');
  });

  it('generates unique IDs for all blocks', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const layout = generateDefaultLayout(fields);
    const ids = layout.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
