import type { MaintenanceStatus } from './types';

export interface Progress {
  completed: number;
  total: number;
  percent: number;
}

export function computeProgress(completed: number, total: number): Progress {
  if (total === 0) return { completed: 0, total: 0, percent: 0 };
  return {
    completed,
    total,
    percent: Math.floor((completed / total) * 100),
  };
}

export type ScheduledClassification =
  | { tone: 'none' }
  | { tone: 'normal' }
  | { tone: 'overdue'; daysAgo: number }
  | { tone: 'soon'; daysUntil: number };

function diffDays(a: string, b: string): number {
  const aMs = Date.parse(a + 'T00:00:00Z');
  const bMs = Date.parse(b + 'T00:00:00Z');
  return Math.round((aMs - bMs) / 86400000);
}

export function classifyScheduled(
  scheduledFor: string | null,
  status: MaintenanceStatus,
  today: string,
): ScheduledClassification {
  if (!scheduledFor) return { tone: 'none' };
  if (status !== 'planned') return { tone: 'normal' };
  const delta = diffDays(scheduledFor, today); // positive = future
  if (delta < 0) return { tone: 'overdue', daysAgo: -delta };
  if (delta <= 14) return { tone: 'soon', daysUntil: delta };
  return { tone: 'normal' };
}
