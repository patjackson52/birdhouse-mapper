/**
 * SSR-safe wrappers around the browser Performance API for TTRC instrumentation.
 *
 * - mark(name) is idempotent within a session — first call wins.
 * - measure(name, start, end?) records a duration entry; end defaults to "now".
 * - getReport() returns all marks + measures we have recorded, sorted by startTime.
 */

const seen = new Set<string>();

function hasPerf(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.performance !== 'undefined';
}

export function mark(name: string): void {
  if (!hasPerf()) return;
  if (seen.has(name)) return;
  seen.add(name);
  try {
    performance.mark(name);
  } catch {
    // performance.mark can throw if the API is partially polyfilled; swallow.
  }
}

export function measure(name: string, startMark: string, endMark?: string): void {
  if (!hasPerf()) return;
  try {
    if (endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name, startMark);
    }
  } catch {
    // measure throws if either mark is missing; swallow so callers don't have to guard.
  }
}

export interface PerfEntry {
  name: string;
  duration: number;
  startTime: number;
  type: 'mark' | 'measure';
}

export function getReport(): PerfEntry[] {
  if (!hasPerf()) return [];
  const marks = performance.getEntriesByType('mark').map((e) => ({
    name: e.name,
    duration: e.duration,
    startTime: e.startTime,
    type: 'mark' as const,
  }));
  const measures = performance.getEntriesByType('measure').map((e) => ({
    name: e.name,
    duration: e.duration,
    startTime: e.startTime,
    type: 'measure' as const,
  }));
  return [...marks, ...measures].sort((a, b) => a.startTime - b.startTime);
}

/** Test-only: clear the idempotency set so a single test run can re-mark names. */
export function _resetForTest(): void {
  seen.clear();
}
