import { describe, it, expect } from 'vitest';
import { computeProgress, classifyScheduled } from '@/lib/maintenance/logic';

describe('computeProgress', () => {
  it('returns 0% when nothing is complete', () => {
    expect(computeProgress(0, 10)).toEqual({ completed: 0, total: 10, percent: 0 });
  });
  it('returns correct percentage', () => {
    expect(computeProgress(3, 10)).toEqual({ completed: 3, total: 10, percent: 30 });
  });
  it('returns 100% when fully complete', () => {
    expect(computeProgress(12, 12)).toEqual({ completed: 12, total: 12, percent: 100 });
  });
  it('returns zero-total result when total is 0', () => {
    expect(computeProgress(0, 0)).toEqual({ completed: 0, total: 0, percent: 0 });
  });
  it('rounds percent down', () => {
    expect(computeProgress(1, 3).percent).toBe(33);
  });
});

describe('classifyScheduled', () => {
  const today = '2026-04-23';

  it('returns "none" when no date', () => {
    expect(classifyScheduled(null, 'planned', today)).toEqual({ tone: 'none' });
  });
  it('returns "overdue" when planned and past', () => {
    expect(classifyScheduled('2026-04-20', 'planned', today)).toEqual({
      tone: 'overdue',
      daysAgo: 3,
    });
  });
  it('returns "soon" when planned and within 14 days', () => {
    expect(classifyScheduled('2026-05-01', 'planned', today)).toEqual({
      tone: 'soon',
      daysUntil: 8,
    });
  });
  it('returns "normal" when planned and more than 14 days out', () => {
    expect(classifyScheduled('2026-06-01', 'planned', today)).toEqual({ tone: 'normal' });
  });
  it('returns "normal" for non-planned statuses even if past', () => {
    expect(classifyScheduled('2026-04-20', 'in_progress', today)).toEqual({ tone: 'normal' });
    expect(classifyScheduled('2026-04-20', 'completed', today)).toEqual({ tone: 'normal' });
    expect(classifyScheduled('2026-04-20', 'cancelled', today)).toEqual({ tone: 'normal' });
  });
});
