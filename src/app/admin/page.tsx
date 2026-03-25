'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge, derivePropertyStatus } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';

type Property = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export default function OrgDashboardPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [domainsCount, setDomainsCount] = useState(0);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [propertiesRes, membershipsRes, domainsRes] = await Promise.all([
        supabase
          .from('properties')
          .select('id, name, slug, is_active, deleted_at, created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('org_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase
          .from('custom_domains')
          .select('id', { count: 'exact', head: true }),
      ]);

      if (propertiesRes.data) {
        setProperties(propertiesRes.data);

        // Fetch item counts per property
        const itemCountsRes = await supabase
          .from('items')
          .select('property_id')
          .in('property_id', propertiesRes.data.map((p) => p.id));

        if (itemCountsRes.data) {
          const counts: Record<string, number> = {};
          for (const item of itemCountsRes.data) {
            counts[item.property_id] = (counts[item.property_id] || 0) + 1;
          }
          setItemCounts(counts);
        }
      }
      if (membershipsRes.count !== null) setMembersCount(membershipsRes.count);
      if (domainsRes.count !== null) setDomainsCount(domainsRes.count);

      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-sage-light rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-8">
        Dashboard
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link href="/admin/properties" className="card hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Properties</p>
          <p className="text-3xl font-semibold text-forest-dark">{properties.length}</p>
        </Link>

        <Link href="/admin/members" className="card hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Members</p>
          <p className="text-3xl font-semibold text-forest-dark">{membersCount}</p>
        </Link>

        <Link href="/admin/domains" className="card hover:shadow-md transition-shadow">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Custom Domains</p>
          <p className="text-3xl font-semibold text-forest-dark">{domainsCount}</p>
        </Link>
      </div>

      {/* Properties list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-forest-dark">Properties</h2>
        <Link href="/admin/properties" className="btn-primary text-sm">
          Create Property
        </Link>
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to get started."
          actionLabel="Create Property"
          onAction={() => router.push('/admin/properties')}
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">
                  Slug
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {properties.map((property) => (
                <tr
                  key={property.id}
                  className="hover:bg-sage-light cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/properties/${property.slug}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                    {property.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                    <span className="font-mono">{property.slug}</span>
                    <span className="ml-2 text-sage/70">
                      — {itemCounts[property.id] ?? 0} items
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={derivePropertyStatus(property)} />
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
