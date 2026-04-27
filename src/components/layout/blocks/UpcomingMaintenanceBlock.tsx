'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import type { MaintenanceStatus } from '@/lib/maintenance/types';

interface RawRow {
  completed_at: string | null;
  maintenance_projects: {
    id: string;
    title: string;
    description: string | null;
    status: MaintenanceStatus;
    scheduled_for: string | null;
    updated_at: string;
  } | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface Props {
  itemId: string;
  propertySlug?: string | null;
  isAuthenticated?: boolean;
}

const ACTIVE_STATUSES: MaintenanceStatus[] = ['planned', 'in_progress'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfTodayUTC(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseScheduledMs(iso: string): number {
  // scheduled_for is a date-only string ('YYYY-MM-DD'). Parse as UTC midnight.
  return Date.parse(iso + 'T00:00:00Z');
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function detailUrl(projectId: string, slug: string, isAuthenticated: boolean): string {
  return isAuthenticated
    ? `/p/${slug}/admin/maintenance/${projectId}`
    : `/p/${slug}/maintenance/${projectId}`;
}

export function UpcomingMaintenanceBlock({
  itemId,
  propertySlug = null,
  isAuthenticated = false,
}: Props) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const res = await supabase
        .from('maintenance_project_items')
        .select(
          'completed_at, maintenance_projects(id, title, description, status, scheduled_for, updated_at)',
        )
        .eq('item_id', itemId);
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        return;
      }
      const raw = (res.data ?? []) as unknown as RawRow[];
      const mapped: ProjectRow[] = raw
        .filter(
          (r): r is RawRow & { maintenance_projects: NonNullable<RawRow['maintenance_projects']> } =>
            r.maintenance_projects !== null,
        )
        .map((r) => ({
          id: r.maintenance_projects.id,
          title: r.maintenance_projects.title,
          description: r.maintenance_projects.description,
          status: r.maintenance_projects.status,
          scheduled_for: r.maintenance_projects.scheduled_for,
          completed_at: r.completed_at,
          updated_at: r.maintenance_projects.updated_at,
        }));
      setRows(mapped);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const buckets = useMemo(() => {
    if (!rows) return null;
    const todayMs = startOfTodayUTC(new Date());
    const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));

    const overdue = active
      .filter((r) => r.scheduled_for !== null && parseScheduledMs(r.scheduled_for) < todayMs)
      .sort(
        (a, b) =>
          parseScheduledMs(a.scheduled_for as string) - parseScheduledMs(b.scheduled_for as string),
      );

    const upcoming = active
      .filter((r) => r.scheduled_for !== null && parseScheduledMs(r.scheduled_for) >= todayMs)
      .sort(
        (a, b) =>
          parseScheduledMs(a.scheduled_for as string) - parseScheduledMs(b.scheduled_for as string),
      );

    const unscheduled = active
      .filter((r) => r.scheduled_for === null)
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

    const lastCompleted =
      rows
        .filter((r) => r.completed_at !== null)
        .sort(
          (a, b) =>
            Date.parse(b.completed_at as string) - Date.parse(a.completed_at as string),
        )[0] ?? null;

    return { overdue, upcoming, unscheduled, lastCompleted };
  }, [rows]);

  if (rows === null) {
    return (
      <div className="card p-4" data-testid="mp-block-skeleton">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-sage-light rounded w-1/3" />
          <div className="h-3 bg-sage-light/70 rounded w-2/3" />
          <div className="h-3 bg-sage-light/70 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const { overdue, upcoming, unscheduled, lastCompleted } = buckets!;
  const totalUpcoming = overdue.length + upcoming.length + unscheduled.length;
  const hasUpcoming = totalUpcoming > 0;
  const countLine = hasUpcoming
    ? `${totalUpcoming} upcoming${overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}`
    : null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="w-7 h-7 rounded-lg bg-sage-light/60 text-forest flex items-center justify-center text-sm"
          >
            🔧
          </span>
          <h3 className="font-heading text-forest-dark text-[15px]">Upcoming Maintenance</h3>
        </div>
        {countLine && <span className="text-xs text-gray-600">{countLine}</span>}
      </div>

      {error && (
        <div className="text-xs text-red-700 mb-2">Couldn&apos;t load maintenance history.</div>
      )}

      {!hasUpcoming && (
        <div className="text-sm text-gray-600 italic py-2">
          {lastCompleted
            ? 'All caught up — no upcoming maintenance.'
            : 'No upcoming maintenance.'}
        </div>
      )}

      {hasUpcoming && (
        <>
          <Subgroup
            label="Overdue"
            tone="overdue"
            rows={overdue}
            propertySlug={propertySlug}
            isAuthenticated={isAuthenticated}
          />
          <Subgroup
            label="Upcoming"
            tone="default"
            rows={upcoming}
            propertySlug={propertySlug}
            isAuthenticated={isAuthenticated}
          />
          <Subgroup
            label="Unscheduled"
            tone="default"
            rows={unscheduled}
            propertySlug={propertySlug}
            isAuthenticated={isAuthenticated}
          />
        </>
      )}

      {lastCompleted && (
        <div className="text-[11px] text-gray-600 mt-3 pt-3 border-t border-dashed border-sage-light flex items-center gap-1 flex-wrap">
          Last maintained via{' '}
          <strong className="text-forest-dark font-medium">{lastCompleted.title}</strong>
          {' · '}
          {formatDate(lastCompleted.completed_at)}
        </div>
      )}
    </div>
  );
}

function Subgroup({
  label,
  tone,
  rows,
  propertySlug,
  isAuthenticated,
}: {
  label: 'Overdue' | 'Upcoming' | 'Unscheduled';
  tone: 'overdue' | 'default';
  rows: ProjectRow[];
  propertySlug: string | null;
  isAuthenticated: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 first:mt-0">
      <div
        className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${
          tone === 'overdue' ? 'text-red-700' : 'text-gray-600'
        }`}
      >
        {label}
      </div>
      <ul className="space-y-1.5">
        {rows.map((p) => (
          <MaintenanceRow
            key={p.id}
            project={p}
            tone={tone}
            propertySlug={propertySlug}
            isAuthenticated={isAuthenticated}
          />
        ))}
      </ul>
    </div>
  );
}

function MaintenanceRow({
  project,
  tone,
  propertySlug,
  isAuthenticated,
}: {
  project: ProjectRow;
  tone: 'overdue' | 'default';
  propertySlug: string | null;
  isAuthenticated: boolean;
}) {
  const isOverdue = tone === 'overdue';
  const baseClasses = `block rounded-lg px-3 py-2 transition-colors ${
    isOverdue
      ? 'border border-red-200 bg-red-50 hover:bg-red-100'
      : 'border border-sage-light bg-white hover:bg-sage-light/30'
  }`;

  const daysLate =
    isOverdue && project.scheduled_for
      ? Math.max(
          1,
          Math.floor(
            (startOfTodayUTC(new Date()) - parseScheduledMs(project.scheduled_for)) / MS_PER_DAY,
          ),
        )
      : 0;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 min-h-[24px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MaintenanceStatusPill status={project.status} size="sm" />
          <span className="text-[13px] font-medium text-forest-dark truncate">{project.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isOverdue ? (
            <span className="text-[11px] font-medium text-red-700">{daysLate}d late</span>
          ) : project.scheduled_for ? (
            <span className="text-[11px] text-gray-600">{formatDate(project.scheduled_for)}</span>
          ) : (
            <span className="text-[11px] text-gray-400">—</span>
          )}
          {propertySlug && (
            <span aria-hidden className="text-sage font-semibold ml-1">
              ›
            </span>
          )}
        </div>
      </div>
      {project.description && (
        <div className="text-[12px] text-gray-600 mt-1 leading-snug line-clamp-1">
          {project.description}
        </div>
      )}
    </>
  );

  if (propertySlug) {
    return (
      <li>
        <a href={detailUrl(project.id, propertySlug, isAuthenticated)} className={baseClasses}>
          {inner}
        </a>
      </li>
    );
  }

  return (
    <li>
      <div className={baseClasses}>{inner}</div>
    </li>
  );
}
