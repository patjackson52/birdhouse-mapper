import { describe, it, expect } from 'vitest';
import { classifyLastMaintained } from '@/lib/maintenance/logic';

const TODAY = '2026-04-24';

describe('classifyLastMaintained', () => {
  it('returns "Never" with danger tone when null', () => {
    expect(classifyLastMaintained(null, TODAY)).toEqual({ tone: 'danger', label: 'Never' });
  });

  it('returns danger with "N mo ago" when older than 365 days', () => {
    const result = classifyLastMaintained('2025-02-28', TODAY);
    expect(result.tone).toBe('danger');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns warn with "N mo ago" between 180 and 365 days', () => {
    const result = classifyLastMaintained('2025-09-01', TODAY);
    expect(result.tone).toBe('warn');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns normal with "N mo ago" between 60 and 180 days', () => {
    const result = classifyLastMaintained('2026-01-01', TODAY);
    expect(result.tone).toBe('normal');
    expect(result.label).toMatch(/mo ago$/);
  });

  it('returns fresh with "N d ago" when 60 days or less', () => {
    const result = classifyLastMaintained('2026-03-15', TODAY);
    expect(result.tone).toBe('fresh');
    expect(result.label).toBe('40 d ago');
  });

  it('returns fresh with "0 d ago" for today', () => {
    const result = classifyLastMaintained(TODAY, TODAY);
    expect(result.tone).toBe('fresh');
    expect(result.label).toBe('0 d ago');
  });
});
