'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type TierCount = { tier: string; count: number };
type StatusCount = { status: string; count: number };
type RecentOrg = { id: string; name: string; slug: string; subscription_tier: string; created_at: string };

export default function PlatformDashboardPage() {
  const [totalOrgs, setTotalOrgs] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalProperties, setTotalProperties] = useState(0);
  const [tierCounts, setTierCounts] = useState<TierCount[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [recentOrgs, setRecentOrgs] = useState<RecentOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [orgsRes, usersRes, propsRes] = await Promise.all([
        supabase.from('orgs').select('id, name, slug, subscription_tier, subscription_status, created_at'),
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('properties').select('id', { count: 'exact', head: true }),
      ]);

      const orgs = orgsRes.data ?? [];
      setTotalOrgs(orgs.length);
      setTotalUsers(usersRes.count ?? 0);
      setTotalProperties(propsRes.count ?? 0);

      // Tier breakdown
      const tiers: Record<string, number> = {};
      const statuses: Record<string, number> = {};
      for (const org of orgs) {
        tiers[org.subscription_tier] = (tiers[org.subscription_tier] || 0) + 1;
        statuses[org.subscription_status] = (statuses[org.subscription_status] || 0) + 1;
      }
      setTierCounts(Object.entries(tiers).map(([tier, count]) => ({ tier, count })));
      setStatusCounts(Object.entries(statuses).map(([status, count]) => ({ status, count })));

      // Recent orgs (last 5)
      const sorted = [...orgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecentOrgs(sorted.slice(0, 5));

      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-24 bg-sage-light rounded" />
            <div className="h-24 bg-sage-light rounded" />
            <div className="h-24 bg-sage-light rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-8">
        Platform Dashboard
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link href="/platform/orgs" className="card py-4 md:py-6 hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Organizations</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalOrgs}</p>
        </Link>
        <div className="card py-4 md:py-6">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Users</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalUsers}</p>
        </div>
        <div className="card py-4 md:py-6">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Properties</p>
          <p className="text-3xl font-semibold text-forest-dark">{totalProperties}</p>
        </div>
      </div>

      {/* Tier & Status breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <div className="card p-4">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">By Tier</h2>
          <div className="space-y-2">
            {tierCounts.map(({ tier, count }) => (
              <div key={tier} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{tier}</span>
                <span className="font-medium text-forest-dark">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">By Status</h2>
          <div className="space-y-2">
            {statusCounts.map(({ status, count }) => (
              <div key={status} className="flex justify-between text-sm">
                <span className="text-gray-600 capitalize">{status}</span>
                <span className="font-medium text-forest-dark">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orgs */}
      <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">Recent Organizations</h2>
      {recentOrgs.length === 0 ? (
        <p className="text-sm text-sage">No organizations yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {recentOrgs.map((org) => (
                <tr key={org.id} className="hover:bg-sage-light/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/platform/orgs/${org.slug}`} className="text-sm font-medium text-forest-dark hover:underline">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_tier}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
