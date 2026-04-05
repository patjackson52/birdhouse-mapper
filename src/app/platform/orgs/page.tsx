'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  created_at: string;
  member_count: number;
  property_count: number;
};

export default function PlatformOrgsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: orgsData } = await supabase
        .from('orgs')
        .select('id, name, slug, subscription_tier, subscription_status, created_at')
        .order('created_at', { ascending: false });

      if (!orgsData) {
        setLoading(false);
        return;
      }

      // Fetch member and property counts
      const orgIds = orgsData.map((o) => o.id);

      const [membershipsRes, propertiesRes] = await Promise.all([
        supabase
          .from('org_memberships')
          .select('org_id')
          .in('org_id', orgIds)
          .eq('status', 'active'),
        supabase
          .from('properties')
          .select('org_id')
          .in('org_id', orgIds)
          .is('deleted_at', null),
      ]);

      const memberCounts: Record<string, number> = {};
      for (const m of membershipsRes.data ?? []) {
        memberCounts[m.org_id] = (memberCounts[m.org_id] || 0) + 1;
      }

      const propCounts: Record<string, number> = {};
      for (const p of propertiesRes.data ?? []) {
        propCounts[p.org_id] = (propCounts[p.org_id] || 0) + 1;
      }

      setOrgs(
        orgsData.map((o) => ({
          ...o,
          member_count: memberCounts[o.id] || 0,
          property_count: propCounts[o.id] || 0,
        })),
      );
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = orgs.filter((org) => {
    if (search && !org.name.toLowerCase().includes(search.toLowerCase()) && !org.slug.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (tierFilter !== 'all' && org.subscription_tier !== tierFilter) return false;
    if (statusFilter !== 'all' && org.subscription_status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-10 bg-sage-light rounded w-full" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Organizations
      </h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="input-field sm:w-40"
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="community">Community</option>
          <option value="pro">Pro</option>
          <option value="municipal">Municipal</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field sm:w-40"
        >
          <option value="all">All Statuses</option>
          <option value="trialing">Trialing</option>
          <option value="active">Active</option>
          <option value="past_due">Past Due</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-sm text-sage mb-3">{filtered.length} organization{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Members</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Properties</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="hover:bg-sage-light/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/platform/orgs/${org.slug}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark">{org.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_tier}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">{org.subscription_status}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.member_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{org.property_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{new Date(org.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-sage">
                    No organizations match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
