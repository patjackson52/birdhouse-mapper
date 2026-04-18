import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { statusColors, statusLabels, formatDate, formatShortDate, formatRelativeDate } from '../utils';
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

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for <1 minute ago', () => {
    expect(formatRelativeDate('2026-04-17T11:59:30Z')).toBe('just now');
  });

  it('returns "Nm ago" for minutes', () => {
    expect(formatRelativeDate('2026-04-17T11:45:00Z')).toBe('15m ago');
  });

  it('returns "Nh ago" for hours', () => {
    expect(formatRelativeDate('2026-04-17T09:00:00Z')).toBe('3h ago');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeDate('2026-04-16T12:00:00Z')).toBe('Yesterday');
  });

  it('returns "Nd ago" for 2–6 days', () => {
    expect(formatRelativeDate('2026-04-14T12:00:00Z')).toBe('3d ago');
  });

  it('returns short date for >=7 days ago', () => {
    expect(formatRelativeDate('2026-04-01T12:00:00Z')).toBe('Apr 1');
  });

  it('returns short date with year for different year', () => {
    expect(formatRelativeDate('2025-06-15T12:00:00Z')).toBe('Jun 15, 2025');
  });

  it('returns "in Nd" for future dates', () => {
    expect(formatRelativeDate('2026-04-20T12:00:00Z')).toBe('in 3d');
  });
});
