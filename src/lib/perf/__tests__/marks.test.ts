import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mark, measure, getReport, _resetForTest } from '../marks';

describe('perf marks', () => {
  beforeEach(() => {
    _resetForTest();
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('mark() records a performance entry', () => {
    mark('test:a');
    const entries = performance.getEntriesByName('test:a', 'mark');
    expect(entries.length).toBe(1);
  });

  it('mark() is idempotent for the same name within a session', () => {
    mark('test:a');
    mark('test:a');
    const entries = performance.getEntriesByName('test:a', 'mark');
    expect(entries.length).toBe(1);
  });

  it('measure() between two marks records the duration', () => {
    mark('test:start');
    mark('test:end');
    measure('test:span', 'test:start', 'test:end');
    const entries = performance.getEntriesByName('test:span', 'measure');
    expect(entries.length).toBe(1);
    expect(entries[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('measure() defaults endMark to now', () => {
    mark('test:start');
    measure('test:to-now', 'test:start');
    const entries = performance.getEntriesByName('test:to-now', 'measure');
    expect(entries.length).toBe(1);
  });

  it('getReport() returns marks and measures sorted by startTime', () => {
    mark('test:a');
    mark('test:b');
    measure('test:a-to-b', 'test:a', 'test:b');
    const report = getReport();
    const names = report.map((r) => r.name);
    expect(names).toContain('test:a');
    expect(names).toContain('test:b');
    expect(names).toContain('test:a-to-b');
    for (let i = 1; i < report.length; i++) {
      expect(report[i].startTime).toBeGreaterThanOrEqual(report[i - 1].startTime);
    }
  });

  it('mark() is a no-op when window is undefined (SSR safety)', () => {
    const originalPerf = (globalThis as any).performance;
    (globalThis as any).performance = undefined;
    expect(() => mark('test:ssr')).not.toThrow();
    (globalThis as any).performance = originalPerf;
  });
});
