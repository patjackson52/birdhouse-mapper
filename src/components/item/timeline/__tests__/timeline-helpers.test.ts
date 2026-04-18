import { describe, it, expect } from 'vitest';
import type { ItemUpdate, UpdateTypeField } from '@/lib/types';
import {
  partitionScheduled,
  detectPrimaryContent,
  getKeyFieldValues,
} from '../timeline-helpers';

const baseUpdate = (overrides: Partial<ItemUpdate> = {}): ItemUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: '2026-04-17T00:00:00Z',
  created_at: '2026-04-17T00:00:00Z',
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  ...overrides,
});

describe('partitionScheduled', () => {
  it('splits updates by update_date relative to now', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const a = baseUpdate({ id: 'a', update_date: '2026-04-16T00:00:00Z' });
    const b = baseUpdate({ id: 'b', update_date: '2026-04-18T00:00:00Z' });
    const c = baseUpdate({ id: 'c', update_date: '2026-04-15T00:00:00Z' });

    const { scheduled, past } = partitionScheduled([a, b, c], now);
    expect(scheduled.map((u) => u.id)).toEqual(['b']);
    expect(past.map((u) => u.id)).toEqual(['a', 'c']); // descending
  });

  it('sorts scheduled ascending (soonest first)', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const far = baseUpdate({ id: 'far', update_date: '2026-05-01T00:00:00Z' });
    const soon = baseUpdate({ id: 'soon', update_date: '2026-04-20T00:00:00Z' });
    const { scheduled } = partitionScheduled([far, soon], now);
    expect(scheduled.map((u) => u.id)).toEqual(['soon', 'far']);
  });

  it('treats update_date === now as past', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const u = baseUpdate({ update_date: '2026-04-17T12:00:00Z' });
    const { scheduled, past } = partitionScheduled([u], now);
    expect(scheduled).toHaveLength(0);
    expect(past).toHaveLength(1);
  });
});

describe('detectPrimaryContent', () => {
  it('returns "photos" when photos are present', () => {
    const u = baseUpdate({ content: 'some long content here that is longer than 40 chars total' });
    const withPhotos = { ...u, photos: [{ id: 'ph1', item_id: 'i1', update_id: 'u1', storage_path: 'x', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }] };
    expect(detectPrimaryContent(withPhotos)).toBe('photos');
  });

  it('returns "content" when no photos and content > 40 chars', () => {
    const u = baseUpdate({ content: 'this is a longer piece of content well over forty characters' });
    expect(detectPrimaryContent(u)).toBe('content');
  });

  it('returns "fields" when content is short and fields exist', () => {
    const u = baseUpdate({
      content: 'short',
      custom_field_values: { f1: 'value' },
    });
    expect(detectPrimaryContent(u)).toBe('fields');
  });

  it('returns "content" as fallback when nothing else matches', () => {
    const u = baseUpdate({ content: null });
    expect(detectPrimaryContent(u)).toBe('content');
  });

  it('ignores empty string and null field values when picking "fields"', () => {
    const u = baseUpdate({ content: '', custom_field_values: { f1: '', f2: null } });
    expect(detectPrimaryContent(u)).toBe('content');
  });
});

describe('getKeyFieldValues', () => {
  const field = (id: string, name: string, sort: number, type: UpdateTypeField['field_type'] = 'text'): UpdateTypeField => ({
    id, update_type_id: 't1', org_id: 'o1', name, field_type: type, options: null, required: false, sort_order: sort,
  });

  it('returns fields in sort_order, skipping empty', () => {
    const fields = [field('b', 'Beta', 2), field('a', 'Alpha', 1), field('c', 'Gamma', 3)];
    const u = baseUpdate({ custom_field_values: { a: 'A-val', b: '', c: 'C-val' } });
    const result = getKeyFieldValues(u, fields, 5);
    expect(result).toEqual([
      { label: 'Alpha', value: 'A-val' },
      { label: 'Gamma', value: 'C-val' },
    ]);
  });

  it('respects limit', () => {
    const fields = [field('a', 'A', 1), field('b', 'B', 2), field('c', 'C', 3)];
    const u = baseUpdate({ custom_field_values: { a: '1', b: '2', c: '3' } });
    expect(getKeyFieldValues(u, fields, 2)).toHaveLength(2);
  });

  it('formats date fields', () => {
    const fields = [field('d', 'When', 1, 'date')];
    const u = baseUpdate({ custom_field_values: { d: '2026-04-17' } });
    const result = getKeyFieldValues(u, fields, 1);
    expect(result[0].label).toBe('When');
    // Accept either locale-specific rendering; just check non-empty, not raw ISO.
    expect(result[0].value).not.toBe('2026-04-17');
    expect(result[0].value).toMatch(/\d/);
  });
});
