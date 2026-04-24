'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import type { MaintenanceStatus } from '@/lib/maintenance/types';

interface ProjectRow {
  id: string;
  title: string;
  status: MaintenanceStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface Props {
  itemId: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MaintenanceProjectsBlock({ itemId }: Props) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const res = await supabase
        .from('maintenance_project_items')
        .select(
          'maintenance_project_id, completed_at, maintenance_projects(id, title, status, scheduled_for, property_id, updated_at)',
        )
        .eq('item_id', itemId);
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        return;
      }
      const raw = (res.data ?? []) as unknown as Array<{
        maintenance_project_id: string;
        completed_at: string | null;
        maintenance_projects: {
          id: string;
          title: string;
          status: MaintenanceStatus;
          scheduled_for: string | null;
          updated_at: string;
        } | null;
      }>;
      const next: ProjectRow[] = raw
        .filter((r): r is typeof r & { maintenance_projects: NonNullable<typeof r.maintenance_projects> } =>
          r.maintenance_projects !== null,
        )
        .map((r) => ({
          id: r.maintenance_projects.id,
          title: r.maintenance_projects.title,
          status: r.maintenance_projects.status,
          scheduled_for: r.maintenance_projects.scheduled_for,
          completed_at: r.completed_at,
          updated_at: r.maintenance_projects.updated_at,
        }))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      setRows(next);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

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

  if (rows.length === 0) {
    return null;
  }

  const lastCompleted = rows
    .filter((r) => r.completed_at !== null)
    .sort(
      (a, b) => Date.parse(b.completed_at as string) - Date.parse(a.completed_at as string),
    )[0];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-7 h-7 rounded-lg bg-sage-light/60 text-forest flex items-center justify-center text-sm">
            🔧
          </span>
          <h3 className="font-heading text-forest-dark text-[15px]">Maintenance</h3>
        </div>
        <span className="text-xs text-gray-600">
          {rows.length} project{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="text-xs text-red-700 mb-2">Couldn&apos;t load maintenance history.</div>
      )}

      <ul className="space-y-1.5">
        {rows.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 border border-sage-light rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaintenanceStatusPill status={p.status} size="sm" />
              <span className="text-[13px] font-medium text-forest-dark truncate">
                {p.title}
              </span>
            </div>
            {p.scheduled_for && (
              <span className="text-[11px] text-gray-500 shrink-0">
                {formatDate(p.scheduled_for)}
              </span>
            )}
          </li>
        ))}
      </ul>

      {lastCompleted && (
        <div className="text-[11px] text-gray-600 mt-3">
          {`Last maintained via · ${formatDate(lastCompleted.completed_at)}`}
        </div>
      )}
    </div>
  );
}
