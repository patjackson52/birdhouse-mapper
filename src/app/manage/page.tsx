'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/item/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { usePermissions } from '@/lib/permissions/hooks';

export default function ManageDashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const { permissions } = usePermissions();

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data } = await supabase
        .from('items')
        .select('*')
        .order('name', { ascending: true });

      if (data) setItems(data);
      setLoading(false);
    }

    fetchData();
  }, []);

  const stats = {
    total: items.length,
    active: items.filter((b) => b.status === 'active').length,
    planned: items.filter((b) => b.status === 'planned').length,
    damaged: items.filter((b) => b.status === 'damaged').length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          Management Dashboard
        </h1>
        <div className="flex gap-2">
          {permissions.items.create && (
            <Link href="/manage/add" className="btn-primary text-sm">
              Add Item
            </Link>
          )}
          {permissions.updates.create && (
            <Link href="/manage/update" className="btn-secondary text-sm">
              Add Update
            </Link>
          )}
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

      {/* Item list */}
      {loading ? (
        <LoadingSpinner className="py-12" />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase tracking-wider hidden md:table-cell">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-sage-light transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-forest-dark">
                      {item.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-sage">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-sage">
                    No items yet. Add your first one!
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
