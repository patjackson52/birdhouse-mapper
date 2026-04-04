import { describe, it, expect } from 'vitest';
import { deriveFormFields } from '../form-derivation';
import type { TypeLayout } from '../types';
import type { CustomField } from '@/lib/types';

describe('deriveFormFields', () => {
  const fields: CustomField[] = [
    { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'dropdown', options: ['Robin', 'Wren'], required: true, sort_order: 0, org_id: 'o1' },
    { id: 'f2', item_type_id: 't1', name: 'Install Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
  ];

  it('extracts field_display blocks as form fields in order', () => {
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
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].id).toBe('f1');
    expect(result.fields[1].id).toBe('f2');
  });

  it('extracts fields from rows', () => {
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
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fieldIds).toEqual(['f1', 'f2']);
  });

  it('includes photo position when photo_gallery block exists', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        { id: 'b3', type: 'field_display', config: { fieldId: 'f2', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.photoPosition).toBe(1);
  });

  it('omits timeline, map_snippet, action_buttons', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'timeline', config: { showUpdates: true, showScheduled: false, maxItems: 5 } },
        { id: 'b2', type: 'map_snippet', config: {} },
        { id: 'b3', type: 'action_buttons', config: {} },
        { id: 'b4', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.fields).toHaveLength(1);
  });

  it('preserves text_label blocks as section headers', () => {
    const layout: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'text_label', config: { text: 'Details', style: 'heading' } },
        { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = deriveFormFields(layout, fields);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].text).toBe('Details');
    expect(result.sections[0].beforeFieldIndex).toBe(0);
  });
});
