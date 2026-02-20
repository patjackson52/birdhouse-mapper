'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Birdhouse } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/birdhouse/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatShortDate } from '@/lib/utils';

export default function ManageDashboard() {
  const [birdhouses, setBirdhouses] = useState<Birdhouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data } = await supabase
        .from('birdhouses')
        .select('*')
        .order('name', { ascending: true });

      if (data) setBirdhouses(data);
      setLoading(false);
    }

    fetchData();
  }, []);

  const stats = {
    total: birdhouses.length,
    active: birdhouses.filter((b) => b.status === 'active').length,
    planned: birdhouses.filter((b) => b.status === 'planned').length,
    damaged: birdhouses.filter((b) => b.status === 'damaged').length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          Management Dashboard
        </h1>
        <div className="flex gap-2">
          <Link href="/manage/add" className="btn-primary text-sm">
            Add Birdhouse
          </Link>
          <Link href="/manage/update" className="btn-secondary text-sm">
            Add Update
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-2xl font-heading font-semibold text-forest-dark">
            {stats.total}
          </p>
          <p className="text-xs text-sage">Total</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-heading font-semibold text-forest">
            {stats.active}
          </p>
          <p className="text-xs text-sage">Active</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-heading font-semibold text-gray-400">
            {stats.planned}
          </p>
          <p className="text-xs text-sage">Planned</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-heading font-semibold text-amber-600">
            {stats.damaged}
          </p>
          <p className="text-xs text-sage">Need Repair</p>
        </div>
      </div>

      {/* Birdhouse list */}
      {loading ? (
        <LoadingSpinner className="py-12" />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider hidden sm:table-cell">
                  Species
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider hidden md:table-cell">
                  Installed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light/50">
              {birdhouses.map((bh) => (
                <tr key={bh.id} className="hover:bg-sage-light/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-forest-dark">
                      {bh.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-sm text-sage">
                      {bh.species_target || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={bh.status} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-sage">
                      {bh.installed_date
                        ? formatShortDate(bh.installed_date)
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {birdhouses.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-sage">
                    No birdhouses yet. Add your first one!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
