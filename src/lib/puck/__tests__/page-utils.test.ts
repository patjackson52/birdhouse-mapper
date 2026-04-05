import { describe, it, expect } from 'vitest';
import { slugify, isReservedSlug, validatePageSlug } from '../page-utils';

describe('slugify', () => {
  it('converts title to lowercase slug', () => {
    expect(slugify('Volunteer Opportunities')).toBe('volunteer-opportunities');
  });

  it('strips special characters', () => {
    expect(slugify('Events & Activities!')).toBe('events-activities');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('my---page')).toBe('my-page');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('isReservedSlug', () => {
  it('rejects reserved slugs', () => {
    expect(isReservedSlug('map')).toBe(true);
    expect(isReservedSlug('list')).toBe(true);
    expect(isReservedSlug('about')).toBe(true);
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('auth')).toBe(true);
    expect(isReservedSlug('api')).toBe(true);
    expect(isReservedSlug('p')).toBe(true);
  });

  it('allows non-reserved slugs', () => {
    expect(isReservedSlug('events')).toBe(false);
    expect(isReservedSlug('volunteer')).toBe(false);
    expect(isReservedSlug('contact')).toBe(false);
  });
});

describe('validatePageSlug', () => {
  it('returns error for reserved slugs', () => {
    expect(validatePageSlug('map', {})).toBe('This URL is reserved by the system');
  });

  it('returns error for duplicate slugs', () => {
    const existing = { '/events': { title: 'Events', slug: 'events', createdAt: '2026-01-01' } };
    expect(validatePageSlug('events', existing)).toBe('A page with this URL already exists');
  });

  it('returns error for empty slug', () => {
    expect(validatePageSlug('', {})).toBe('URL slug is required');
  });

  it('returns null for valid slug', () => {
    expect(validatePageSlug('volunteer', {})).toBeNull();
  });
});
