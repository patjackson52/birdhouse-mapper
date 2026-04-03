import { describe, it, expect } from 'vitest';
import { validateFieldValues } from '../validate';
import type { UpdateTypeField } from '@/lib/types';

function makeField(overrides: Partial<UpdateTypeField> = {}): UpdateTypeField {
  return {
    id: 'field-1', update_type_id: 'ut-1', org_id: 'org-1',
    name: 'Test Field', field_type: 'text', options: null,
    required: false, sort_order: 0, ...overrides,
  };
}

describe('validateFieldValues', () => {
  it('returns no errors for empty fields and empty values', () => {
    expect(validateFieldValues([], {})).toEqual([]);
  });

  it('returns no errors when optional fields are missing', () => {
    const fields = [makeField({ required: false })];
    expect(validateFieldValues(fields, {})).toEqual([]);
  });

  it('returns error when required field is missing', () => {
    const fields = [makeField({ id: 'f1', name: 'Condition', required: true })];
    const errors = validateFieldValues(fields, {});
    expect(errors).toEqual([{ fieldId: 'f1', fieldName: 'Condition', message: 'Condition is required' }]);
  });

  it('returns error when required field is empty string', () => {
    const fields = [makeField({ id: 'f1', name: 'Condition', required: true })];
    const errors = validateFieldValues(fields, { f1: '' });
    expect(errors).toEqual([{ fieldId: 'f1', fieldName: 'Condition', message: 'Condition is required' }]);
  });

  it('passes when required field has a value', () => {
    const fields = [makeField({ id: 'f1', required: true })];
    expect(validateFieldValues(fields, { f1: 'Good' })).toEqual([]);
  });

  it('passes with number value of 0 for required number field', () => {
    const fields = [makeField({ id: 'f1', field_type: 'number', required: true })];
    expect(validateFieldValues(fields, { f1: 0 })).toEqual([]);
  });

  it('ignores unknown field IDs in values', () => {
    const fields = [makeField({ id: 'f1', required: false })];
    expect(validateFieldValues(fields, { f1: 'x', unknown: 'y' })).toEqual([]);
  });

  it('validates multiple required fields independently', () => {
    const fields = [
      makeField({ id: 'f1', name: 'A', required: true }),
      makeField({ id: 'f2', name: 'B', required: true }),
    ];
    const errors = validateFieldValues(fields, { f1: 'ok' });
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldId).toBe('f2');
  });
});
