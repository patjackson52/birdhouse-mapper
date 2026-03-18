import { describe, it, expect } from 'vitest';
import { statusColors, statusLabels, formatDate, formatShortDate } from '../utils';
import type { ItemStatus } from '../types';

describe('statusColors', () => {
  it('has a color for every status', () => {
    const statuses: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];
    for (const status of statuses) {
      expect(statusColors[status]).toBeDefined();
      expect(statusColors[status]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('statusLabels', () => {
  it('has a label for every status', () => {
    const statuses: ItemStatus[] = ['active', 'planned', 'damaged', 'removed'];
    for (const status of statuses) {
      expect(statusLabels[status]).toBeDefined();
      expect(typeof statusLabels[status]).toBe('string');
    }
  });

  it('returns human-readable labels', () => {
    expect(statusLabels.active).toBe('Active');
    expect(statusLabels.damaged).toBe('Needs Repair');
  });
});

describe('formatDate', () => {
  it('formats an ISO datetime string', () => {
    const result = formatDate('2025-03-15T12:00:00Z');
    expect(result).toContain('March');
    expect(result).toContain('2025');
  });

  it('returns a non-empty string', () => {
    expect(formatDate('2025-01-01T00:00:00Z').length).toBeGreaterThan(0);
  });
});

describe('formatShortDate', () => {
  it('formats an ISO datetime string in short form', () => {
    const result = formatShortDate('2025-03-15T12:00:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('2025');
  });
});
