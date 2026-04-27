'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MaintenanceProjectRow } from './MaintenanceProjectRow';
import { MaintenanceStatCard } from './MaintenanceStatCard';
import { NewProjectButton } from './NewProjectButton';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

type Tab = 'active' | 'completed' | 'cancelled' | 'all';

interface Property {
  id: string;
  name: string;
  slug: string;
}

interface Stats {
  in_progress: number;
  due_soon: number;
  overdue: number;
  completed_this_year: number;
}

interface Props {
  mode: 'org' | 'property';
  rows: MaintenanceProjectRowData[];
  properties: Property[];
  stats: Stats;
  today: string;
  /** Per-row detail URL, keyed by row id. Pre-computed server-side. */
  detailHrefByRowId: Record<string, string>;
  /** Per-property create URL, keyed by property slug. Pre-computed server-side. */
  createHrefBySlug: Record<string, string>;
  /** Property mode only: direct create-form URL. Required when mode === 'property'. */
  createHref?: string;
}

const TAB_LABELS: Record<Tab, string> = {
  active: 'No active projects',
  completed: 'No completed projects',
  cancelled: 'No cancelled projects',
  all: 'No projects yet',
};

function matchesTab(status: MaintenanceProjectRowData['status'], tab: Tab): boolean {
  if (tab === 'active') return status === 'planned' || status === 'in_progress';
  if (tab === 'completed') return status === 'completed';
  if (tab === 'cancelled') return status === 'cancelled';
  return true;
}

export function MaintenanceListView({
  mode,
  rows,
  properties,
  stats,
  today,
  detailHrefByRowId,
  createHrefBySlug,
  createHref,
}: Props) {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    active: rows.filter((r) => matchesTab(r.status, 'active')).length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesTab(r.status, tab)) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const shouldGroup = mode === 'org' && properties.length >= 2;

  // Build groups in property-prop order; only include groups with at least one matching row.
  const groups = useMemo(() => {
    if (!shouldGroup) return null;
    return properties
      .map((p) => ({
        property: p,
        rows: filtered.filter((r) => r.property_id === p.id),
      }))
      .filter((g) => g.rows.length > 0);
  }, [properties, filtered, shouldGroup]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data</div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Scheduled Maintenance</h1>
        </div>
        <NewProjectButton
          mode={mode}
          properties={properties}
          createHref={createHref}
          createHrefBySlug={createHrefBySlug}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MaintenanceStatCard label="In progress" value={stats.in_progress} tint="blue" />
        <MaintenanceStatCard label="Due in 2 weeks" value={stats.due_soon} tint="amber" />
        <MaintenanceStatCard label="Overdue" value={stats.overdue} tint="red" />
        <MaintenanceStatCard label="Completed this year" value={stats.completed_this_year} tint="green" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-sage-light gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {(
              [
                ['active', 'Active', counts.active],
                ['completed', 'Completed', counts.completed],
                ['cancelled', 'Cancelled', counts.cancelled],
                ['all', 'All', counts.all],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                  tab === id
                    ? 'bg-sage-light/70 text-forest-dark font-semibold'
                    : 'text-gray-600 hover:bg-sage-light/30 font-medium'
                }`}
              >
                {label}
                <span className="text-[11px] text-gray-500">{count}</span>
              </button>
            ))}
          </div>
          <input
            className="input-field w-64"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-5">
              <div className="font-heading text-forest-dark text-base mb-2">
                {mode === 'org' && properties.length === 0
                  ? 'No active properties yet'
                  : TAB_LABELS[tab]}
              </div>
              <div className="text-sm text-gray-600 mb-4">
                {mode === 'org' && properties.length === 0
                  ? 'Add a property to start planning maintenance.'
                  : rows.length === 0
                  ? 'Plan seasonal work, repairs, and group efforts across your map items.'
                  : 'Try a different tab or clear your search.'}
              </div>
              {mode === 'org' && properties.length === 0 ? (
                <Link href="/admin/properties" className="btn-primary">
                  Manage properties
                </Link>
              ) : null}
            </div>
          ) : shouldGroup ? (
            (groups ?? []).map((g) => (
              <div key={g.property.id}>
                <div className="px-5 py-2.5 border-b border-sage-light bg-sage-light/20">
                  <Link
                    href={`/admin/properties/${g.property.slug}/maintenance`}
                    className="font-heading text-forest-dark text-sm font-semibold hover:underline"
                  >
                    {g.property.name}
                  </Link>
                  <span className="text-xs text-gray-600 ml-2">
                    {g.rows.length} project{g.rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {g.rows.map((r) => (
                  <MaintenanceProjectRow
                    key={r.id}
                    row={r}
                    today={today}
                    detailHref={detailHrefByRowId[r.id] ?? '#'}
                  />
                ))}
              </div>
            ))
          ) : (
            filtered.map((r) => (
              <MaintenanceProjectRow
                key={r.id}
                row={r}
                today={today}
                detailHref={detailHrefByRowId[r.id] ?? '#'}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
