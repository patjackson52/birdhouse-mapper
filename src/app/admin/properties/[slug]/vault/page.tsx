'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getVaultItems, setPropertyExclusion } from '@/lib/vault/actions';
import type { VaultItem, VaultCategory } from '@/lib/vault/types';
import VaultTable from '@/app/admin/vault/VaultTable';

type CategoryFilter = '' | VaultCategory;

export default function PropertyVaultPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [orgId, setOrgId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludeSuccess, setExcludeSuccess] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [search, setSearch] = useState('');

  const loadItems = useCallback(
    async (currentOrgId: string, currentPropertyId: string) => {
      const filters: Parameters<typeof getVaultItems>[1] = {
        propertyId: currentPropertyId,
      };
      if (categoryFilter) filters.category = categoryFilter;
      if (search.trim()) filters.search = search.trim();

      const result = await getVaultItems(currentOrgId, filters);
      if (result.error) {
        setError(result.error);
      } else {
        setItems(result.items);
      }
    },
    [categoryFilter, search]
  );

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) {
        setLoading(false);
        return;
      }

      const currentOrgId = membership.org_id as string;
      setOrgId(currentOrgId);

      const { data: property } = await supabase
        .from('properties')
        .select('id, name')
        .eq('slug', slug)
        .eq('org_id', currentOrgId)
        .single();

      if (!property) {
        setError('Property not found.');
        setLoading(false);
        return;
      }

      const currentPropertyId = property.id as string;
      setPropertyId(currentPropertyId);
      setPropertyName(property.name as string);

      await loadItems(currentOrgId, currentPropertyId);
      setLoading(false);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when filters change (after initial load)
  useEffect(() => {
    if (orgId && propertyId) {
      loadItems(orgId, propertyId);
    }
  }, [orgId, propertyId, loadItems]);

  async function handleBulkExclude(ids: string[]) {
    if (!propertyId) return;
    setError(null);
    setExcludeSuccess(null);

    const results = await Promise.all(
      ids.map((id) => setPropertyExclusion(id, propertyId, true))
    );
    const errors = results
      .filter((r) => 'error' in r)
      .map((r) => ('error' in r ? r.error : ''));

    if (errors.length > 0) {
      setError(`Some exclusions failed: ${errors.join(', ')}`);
    } else {
      setExcludeSuccess(
        `${ids.length} item${ids.length !== 1 ? 's' : ''} excluded from this property.`
      );
    }

    if (orgId && propertyId) {
      await loadItems(orgId, propertyId);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-6 bg-sage-light rounded w-full" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Data Vault</h1>
        <p className="text-sm text-sage mt-1">
          Files available to{' '}
          <span className="font-medium text-forest-dark">{propertyName || slug}</span>. Exclude
          items to hide them from this property.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success banner */}
      {excludeSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">{excludeSuccess}</p>
          <button
            onClick={() => setExcludeSuccess(null)}
            className="mt-1 text-xs text-green-500 hover:text-green-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm w-52"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="input-field text-sm"
        >
          <option value="">All categories</option>
          <option value="photo">Photo</option>
          <option value="document">Document</option>
          <option value="branding">Branding</option>
          <option value="geospatial">Geospatial</option>
        </select>

        {(categoryFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('');
              setSearch('');
            }}
            className="text-sm text-sage hover:text-forest-dark transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table — bulk action is Exclude instead of Delete */}
      <VaultTable
        items={items}
        onItemClick={() => {}}
        onDelete={handleBulkExclude}
        bulkActionLabel="Exclude"
        bulkActionConfirm={(count) =>
          `Exclude ${count} item${count !== 1 ? 's' : ''} from this property? They will remain in the org vault.`
        }
      />

      {/* Footer stats */}
      {items.length > 0 && (
        <div className="flex items-center gap-6 text-sm text-sage pt-2 border-t border-sage-light">
          <span>
            <span className="font-medium text-forest-dark">{items.length}</span>{' '}
            {items.length === 1 ? 'file' : 'files'} visible to this property
          </span>
        </div>
      )}
    </div>
  );
}
