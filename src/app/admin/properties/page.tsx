'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge, derivePropertyStatus } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import {
  createProperty,
  archiveProperty,
  unarchiveProperty,
  getProperties,
} from './actions';

type Property = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

type FilterTab = 'all' | 'active' | 'setup' | 'archived';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function PropertiesPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [properties, setProperties] = useState<Property[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [customDomains, setCustomDomains] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  async function loadProperties() {
    const result = await getProperties();
    if (result.properties) {
      const props = result.properties as Property[];
      setProperties(props);

      const supabase = createClient();
      const propertyIds = props.map((p) => p.id);

      const [itemsRes, membershipsRes, domainsRes] = await Promise.all([
        supabase.from('items').select('property_id').in('property_id', propertyIds),
        supabase
          .from('property_memberships')
          .select('property_id')
          .in('property_id', propertyIds),
        supabase
          .from('custom_domains')
          .select('property_id, domain')
          .in('property_id', propertyIds)
          .eq('status', 'active'),
      ]);

      if (itemsRes.data) {
        const counts: Record<string, number> = {};
        for (const item of itemsRes.data) {
          counts[item.property_id] = (counts[item.property_id] || 0) + 1;
        }
        setItemCounts(counts);
      }

      if (membershipsRes.data) {
        const counts: Record<string, number> = {};
        for (const m of membershipsRes.data) {
          counts[m.property_id] = (counts[m.property_id] || 0) + 1;
        }
        setMemberCounts(counts);
      }

      if (domainsRes.data) {
        const domains: Record<string, string> = {};
        for (const d of domainsRes.data) {
          domains[d.property_id] = d.domain;
        }
        setCustomDomains(domains);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProperties();
  }, []);

  function handleNameChange(name: string) {
    setFormName(name);
    setFormSlug(toSlug(name));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formSlug.trim()) return;

    setFormError(null);
    setFormLoading(true);

    const result = await createProperty({
      name: formName,
      slug: formSlug,
      description: formDescription || undefined,
    });

    setFormLoading(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    // Redirect to the new property's admin page
    router.push(`/admin/properties/${result.slug}`);
  }

  function handleArchiveToggle(property: Property) {
    const action = property.deleted_at !== null ? unarchiveProperty : archiveProperty;
    startTransition(async () => {
      await action(property.id);
      await loadProperties();
    });
  }

  const filteredProperties = properties.filter((p) => {
    if (activeTab === 'all') return true;
    return derivePropertyStatus(p) === activeTab;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'setup', label: 'Setup' },
    { key: 'archived', label: 'Archived' },
  ];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Properties</h1>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="btn-primary text-sm"
        >
          {showCreateForm ? 'Cancel' : 'Create Property'}
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="card mb-6 border border-sage-light bg-sage-light/30">
          <h2 className="font-heading text-base font-semibold text-forest-dark mb-4">
            New Property
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input-field"
                value={formName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Birdhouse Property"
                required
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                type="text"
                className="input-field font-mono"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="my-birdhouse-property"
                required
              />
              <p className="text-xs text-sage mt-1">
                URL-friendly identifier. Auto-generated from name.
              </p>
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea
                className="input-field"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="A brief description of this property…"
                rows={3}
              />
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{formError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn-primary text-sm"
                disabled={formLoading || !formName.trim() || !formSlug.trim()}
              >
                {formLoading ? 'Creating…' : 'Create Property'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormName('');
                  setFormSlug('');
                  setFormDescription('');
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-sage-light">
        {tabs.map(({ key, label }) => {
          const count =
            key === 'all'
              ? properties.length
              : properties.filter((p) => derivePropertyStatus(p) === key).length;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-forest text-forest-dark'
                  : 'border-transparent text-sage hover:text-forest-dark'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Property table */}
      {filteredProperties.length === 0 ? (
        <EmptyState
          title="No properties"
          description={
            activeTab === 'all'
              ? 'Create your first property to get started.'
              : `No ${activeTab} properties.`
          }
          actionLabel={activeTab === 'all' ? 'Create Property' : undefined}
          onAction={activeTab === 'all' ? () => setShowCreateForm(true) : undefined}
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
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
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                  Items
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase hidden md:table-cell">
                  Members
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden lg:table-cell">
                  Domain
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {filteredProperties.map((property) => {
                const status = derivePropertyStatus(property);
                const isArchived = status === 'archived';
                return (
                  <tr
                    key={property.id}
                    className="hover:bg-sage-light cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/properties/${property.slug}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-forest-dark">
                      {property.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage font-mono hidden sm:table-cell">
                      {property.slug}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-sage text-right hidden md:table-cell">
                      {itemCounts[property.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage text-right hidden md:table-cell">
                      {memberCounts[property.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage font-mono hidden lg:table-cell">
                      {customDomains[property.id] || <span className="italic opacity-50 font-sans">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveToggle(property);
                        }}
                        disabled={isPending}
                        className="text-xs text-sage hover:text-forest-dark transition-colors disabled:opacity-50"
                      >
                        {isArchived ? 'Unarchive' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
