'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getVaultItems, getVaultQuota, deleteFromVault } from '@/lib/vault/actions';
import type { VaultItem, VaultQuota } from '@/lib/vault/types';
import StorageUsageBar from './StorageUsageBar';
import VaultTable from './VaultTable';
import VaultDetailModal from './VaultDetailModal';

type CategoryFilter = '' | 'photo' | 'document' | 'branding' | 'geospatial';
type VisibilityFilter = '' | 'public' | 'private';
type AiFilter = '' | 'yes' | 'no';

export default function VaultPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [quota, setQuota] = useState<VaultQuota | null>(null);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('');
  const [aiFilter, setAiFilter] = useState<AiFilter>('');
  const [search, setSearch] = useState('');

  // Detail modal
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [exclusions, setExclusions] = useState<Set<string>>(new Set());
  const [loadingExclusions, setLoadingExclusions] = useState(false);

  const loadData = useCallback(
    async (currentOrgId: string) => {
      const filters: Parameters<typeof getVaultItems>[1] = {};
      if (categoryFilter) filters.category = categoryFilter;
      if (visibilityFilter) filters.visibility = visibilityFilter;
      if (aiFilter === 'yes') filters.isAiContext = true;
      if (aiFilter === 'no') filters.isAiContext = false;
      if (search.trim()) filters.search = search.trim();

      const [itemsResult, quotaResult] = await Promise.all([
        getVaultItems(currentOrgId, filters),
        getVaultQuota(currentOrgId),
      ]);

      if (itemsResult.error) {
        setError(itemsResult.error);
      } else {
        setItems(itemsResult.items);
      }

      if (!quotaResult.error && quotaResult.quota) {
        setQuota(quotaResult.quota);
      }
    },
    [categoryFilter, visibilityFilter, aiFilter, search]
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

      const id = membership.org_id as string;
      setOrgId(id);

      // Load properties for detail modal
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name')
        .eq('org_id', id)
        .order('name', { ascending: true });

      setProperties((propsData ?? []) as { id: string; name: string }[]);

      await loadData(id);
      setLoading(false);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when filters change (after initial load)
  useEffect(() => {
    if (orgId) {
      loadData(orgId);
    }
  }, [orgId, loadData]);

  async function handleItemClick(item: VaultItem) {
    setSelectedItem(item);
    setLoadingExclusions(true);
    setExclusions(new Set());

    const supabase = createClient();
    const { data } = await supabase
      .from('vault_item_property_exclusions')
      .select('property_id')
      .eq('vault_item_id', item.id);

    setExclusions(new Set((data ?? []).map((e: { property_id: string }) => e.property_id)));
    setLoadingExclusions(false);
  }

  async function handleBulkDelete(ids: string[]) {
    if (!orgId) return;
    setError(null);

    const results = await Promise.all(ids.map((id) => deleteFromVault(id)));
    const errors = results.filter((r) => 'error' in r).map((r) => ('error' in r ? r.error : ''));
    if (errors.length > 0) {
      setError(`Some deletes failed: ${errors.join(', ')}`);
    }

    await loadData(orgId);
  }

  function handleModalUpdated(updated: Partial<VaultItem>) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedItem?.id ? { ...item, ...updated } : item
      )
    );
    if (selectedItem) {
      setSelectedItem({ ...selectedItem, ...updated });
    }
  }

  function handleModalDeleted(deletedId: string) {
    setItems((prev) => prev.filter((item) => item.id !== deletedId));
    setSelectedItem(null);
    if (orgId) loadData(orgId);
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
          Manage your organization&apos;s files, photos, and documents.
        </p>
      </div>

      {/* Storage usage bar */}
      {quota && (
        <div className="card">
          <StorageUsageBar
            currentBytes={quota.current_storage_bytes}
            maxBytes={quota.max_storage_bytes}
          />
        </div>
      )}

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

        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
          className="input-field text-sm"
        >
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>

        <select
          value={aiFilter}
          onChange={(e) => setAiFilter(e.target.value as AiFilter)}
          className="input-field text-sm"
        >
          <option value="">All AI priority</option>
          <option value="yes">AI context</option>
          <option value="no">Not AI context</option>
        </select>

        {(categoryFilter || visibilityFilter || aiFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('');
              setVisibilityFilter('');
              setAiFilter('');
              setSearch('');
            }}
            className="text-sm text-sage hover:text-forest-dark transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <VaultTable
        items={items}
        onItemClick={handleItemClick}
        onDelete={handleBulkDelete}
      />

      {/* Footer stats */}
      {items.length > 0 && (
        <div className="flex items-center gap-6 text-sm text-sage pt-2 border-t border-sage-light">
          <span>
            <span className="font-medium text-forest-dark">{items.length}</span>{' '}
            {items.length === 1 ? 'file' : 'files'}
          </span>
        </div>
      )}

      {/* Detail modal */}
      {selectedItem && !loadingExclusions && (
        <VaultDetailModal
          item={selectedItem}
          properties={properties}
          exclusions={exclusions}
          onClose={() => setSelectedItem(null)}
          onUpdated={handleModalUpdated}
          onDeleted={handleModalDeleted}
        />
      )}
    </div>
  );
}
