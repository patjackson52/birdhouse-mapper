import { describe, it, expect } from 'vitest';
import { removeFieldFromLayout, findFieldsNotInLayout } from '../field-sync';
import type { TypeLayout } from '../types';

describe('removeFieldFromLayout', () => {
  it('removes a field_display block referencing the deleted field', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
        { id: 'b3', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = removeFieldFromLayout(layout, 'f1');
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.find((b) => b.type === 'field_display' && (b as any).config.fieldId === 'f1')).toBeUndefined();
  });

  it('removes a field_display from inside a row', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = removeFieldFromLayout(layout, 'f1');
    // Row should unwrap since only 1 child remains
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('field_display');
  });

  it('returns layout unchanged if field not referenced', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = removeFieldFromLayout(layout, 'f999');
    expect(result.blocks).toHaveLength(1);
  });
});

describe('findFieldsNotInLayout', () => {
  it('finds fields not referenced by any field_display block', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const fieldIds = ['f1', 'f2', 'f3'];
    const missing = findFieldsNotInLayout(layout, fieldIds);
    expect(missing).toEqual(['f2', 'f3']);
  });

  it('checks inside rows too', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const missing = findFieldsNotInLayout(layout, ['f1', 'f2', 'f3']);
    expect(missing).toEqual(['f3']);
  });

  it('returns empty array when all fields are in layout', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const missing = findFieldsNotInLayout(layout, ['f1']);
    expect(missing).toEqual([]);
  });
});
