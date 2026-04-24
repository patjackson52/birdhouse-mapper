'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import { MaintenanceStatCard } from '@/components/maintenance/MaintenanceStatCard';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

type Tab = 'active' | 'completed' | 'cancelled' | 'all';

interface Props {
  rows: MaintenanceProjectRowData[];
  today: string;
  propertySlug: string;
}

export function MaintenanceListClient({ rows, today, propertySlug }: Props) {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === 'planned' || r.status === 'in_progress').length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    const cancelled = rows.filter((r) => r.status === 'cancelled').length;
    return { active, completed, cancelled, all: rows.length };
  }, [rows]);

  const stats = useMemo(() => {
    const inProgress = rows.filter((r) => r.status === 'in_progress').length;
    let overdue = 0;
    let dueSoon = 0;
    for (const r of rows) {
      const c = classifyScheduled(r.scheduled_for, r.status, today);
      if (c.tone === 'overdue') overdue++;
      else if (c.tone === 'soon') dueSoon++;
    }
    const year = today.slice(0, 4);
    const completedThisYear = rows.filter(
      (r) => r.status === 'completed' && r.updated_at.slice(0, 4) === year,
    ).length;
    return { inProgress, overdue, dueSoon, completedThisYear };
  }, [rows, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'active' && !(r.status === 'planned' || r.status === 'in_progress')) return false;
      if (tab === 'completed' && r.status !== 'completed') return false;
      if (tab === 'cancelled' && r.status !== 'cancelled') return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data</div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Scheduled Maintenance</h1>
        </div>
        <Link href={`/admin/properties/${propertySlug}/maintenance/new`} className="btn-primary">
          + New project
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MaintenanceStatCard label="In progress" value={stats.inProgress} tint="blue" />
        <MaintenanceStatCard label="Due in 2 weeks" value={stats.dueSoon} tint="amber" />
        <MaintenanceStatCard label="Overdue" value={stats.overdue} tint="red" />
        <MaintenanceStatCard label="Completed this year" value={stats.completedThisYear} tint="green" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-sage-light gap-3">
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
            <div className="text-center py-12 text-sm text-gray-600">No matches.</div>
          ) : (
            filtered.map((r) => (
              <MaintenanceProjectRow key={r.id} row={r} today={today} propertySlug={propertySlug} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
