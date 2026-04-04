import { describe, it, expect } from 'vitest';
import { typeLayoutSchema } from '../schemas';
import { generateDefaultLayout } from '../defaults';
import { generateMockItem } from '../mock-data';
import { deriveFormFields } from '../form-derivation';
import { removeFieldFromLayout, findFieldsNotInLayout } from '../field-sync';
import type { CustomField, ItemType } from '@/lib/types';
import type { LayoutBlock, TypeLayout } from '../types';

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

const fields: CustomField[] = [
  { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: true, sort_order: 0, org_id: 'o1' },
  { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
  { id: 'f3', item_type_id: 't1', name: 'Height', field_type: 'number', options: null, required: false, sort_order: 2, org_id: 'o1' },
];

describe('Layout system integration', () => {
  it('full lifecycle: generate → validate → mock → derive form → delete field', () => {
    // 1. Generate default layout
    const layout = generateDefaultLayout(fields);
    expect(layout.blocks.length).toBeGreaterThan(3);

    // 2. Validate generated layout
    const validated = typeLayoutSchema.safeParse(layout);
    expect(validated.success).toBe(true);

    // 3. Generate mock item for preview
    const mock = generateMockItem(itemType, fields);
    expect(mock.custom_field_values['f1']).toBe('Robin');
    expect(mock.custom_field_values['f2']).toBeDefined();
    expect(mock.custom_field_values['f3']).toBe(42);

    // 4. Derive form fields
    const form = deriveFormFields(layout, fields);
    expect(form.fields).toHaveLength(3);
    expect(form.fields[0].name).toBe('Species');
    expect(form.fields[1].name).toBe('Install Date');
    expect(form.fields[2].name).toBe('Height');

    // 5. Delete a field — layout updates
    const updated = removeFieldFromLayout(layout, 'f2');
    expect(updated.blocks.length).toBe(layout.blocks.length - 1);

    // 6. Validate updated layout still valid
    const revalidated = typeLayoutSchema.safeParse(updated);
    expect(revalidated.success).toBe(true);

    // 7. Derive form after deletion — should have 2 fields
    const formAfterDelete = deriveFormFields(updated, fields.filter((f) => f.id !== 'f2'));
    expect(formAfterDelete.fields).toHaveLength(2);
  });

  it('backward compatibility: null layout handled gracefully', () => {
    const emptyFields = findFieldsNotInLayout(
      { version: 1, blocks: [], spacing: 'comfortable', peekBlockCount: 0 } as any,
      ['f1', 'f2'],
    );
    expect(emptyFields).toEqual(['f1', 'f2']);
  });

  it('field sync detects fields not in layout', () => {
    const layout = generateDefaultLayout([fields[0]]);
    const missing = findFieldsNotInLayout(layout, ['f1', 'f2', 'f3']);
    expect(missing).toEqual(['f2', 'f3']);
  });

  it('layout with rows validates and derives form correctly', () => {
    const layout = generateDefaultLayout(fields);
    const fieldBlocks = layout.blocks.filter((b) => b.type === 'field_display') as LayoutBlock[];
    const otherBlocks = layout.blocks.filter((b) => b.type !== 'field_display');

    const rowLayout: TypeLayout = {
      ...layout,
      blocks: [
        ...otherBlocks.slice(0, -1),
        {
          id: 'row1',
          type: 'row' as const,
          children: [fieldBlocks[0], fieldBlocks[1]],
          gap: 'normal' as const,
          distribution: 'equal' as const,
        },
        fieldBlocks[2],
        otherBlocks[otherBlocks.length - 1],
      ],
    };

    const validated = typeLayoutSchema.safeParse(rowLayout);
    expect(validated.success).toBe(true);

    const form = deriveFormFields(rowLayout, fields);
    expect(form.rows).toHaveLength(1);
    expect(form.rows[0].fieldIds).toHaveLength(2);
  });
});
