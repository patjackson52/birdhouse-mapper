import { describe, it, expect } from 'vitest';
import { snapToPercent, SNAP_POINTS } from '../resize-utils';

describe('snapToPercent', () => {
  it('snaps 48 to 50', () => {
    expect(snapToPercent(48)).toBe(50);
  });

  it('snaps 52 to 50', () => {
    expect(snapToPercent(52)).toBe(50);
  });

  it('snaps 30 to 33', () => {
    expect(snapToPercent(30)).toBe(33);
  });

  it('snaps 70 to 66', () => {
    expect(snapToPercent(70)).toBe(66);
  });

  it('clamps below 25 to 25', () => {
    expect(snapToPercent(10)).toBe(25);
  });

  it('clamps above 100 to 100', () => {
    expect(snapToPercent(120)).toBe(100);
  });

  it('snaps exact values to themselves', () => {
    for (const pt of SNAP_POINTS) {
      expect(snapToPercent(pt)).toBe(pt);
    }
  });

  it('snaps boundary between 33 and 50 correctly', () => {
    // Midpoint is 41.5 — 41 should snap to 33, 42 should snap to 50
    expect(snapToPercent(41)).toBe(33);
    expect(snapToPercent(42)).toBe(50);
  });
});
