'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getVaultItems } from '@/lib/vault/actions';
import { getVaultUrl } from '@/lib/vault/helpers';
import type { VaultItem, VaultCategory } from '@/lib/vault/types';

interface VaultBrowseTabProps {
  orgId: string;
  categoryFilter?: VaultCategory[];
  visibilityFilter?: string;
  propertyId?: string;
  multiple?: boolean;
  onSelect: (items: VaultItem[]) => void;
}

const ALL_CATEGORIES: VaultCategory[] = ['photo', 'document', 'branding', 'geospatial'];

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  photo: 'Photos',
  document: 'Documents',
  branding: 'Branding',
  geospatial: 'Geospatial',
};

const CATEGORY_ICONS: Record<VaultCategory, string> = {
  photo: '🖼️',
  document: '📄',
  branding: '🎨',
  geospatial: '🗺️',
};

function isImageMime(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

function ThumbnailImage({ item }: { item: VaultItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const result = getVaultUrl(item);
    if (typeof result === 'string') {
      setUrl(result);
    } else {
      result.then(setUrl).catch(() => setUrl(null));
    }
  }, [item.id, item.storage_bucket, item.storage_path]);

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <span className="text-2xl">{CATEGORY_ICONS[item.category]}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={item.file_name}
      className="w-full h-full object-cover"
      onError={() => setUrl(null)}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg overflow-hidden border border-gray-200">
      <div className="bg-gray-200 aspect-square" />
      <div className="p-2 space-y-1">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function VaultBrowseTab({
  orgId,
  categoryFilter,
  visibilityFilter,
  propertyId,
  multiple = false,
  onSelect,
}: VaultBrowseTabProps) {
  const availableCategories = useMemo(
    () => categoryFilter ?? ALL_CATEGORIES,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryFilter?.join(',')],
  );

  const [activeCategory, setActiveCategory] = useState<VaultCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { items: fetched } = await getVaultItems(orgId, {
      category: activeCategory !== 'all' ? activeCategory : undefined,
      visibility: visibilityFilter,
      search: search || undefined,
      propertyId,
    });
    // Client-side filter to available categories when "all" is selected
    const filtered =
      activeCategory === 'all'
        ? fetched.filter((i) => availableCategories.includes(i.category))
        : fetched;
    setItems(filtered);
    setLoading(false);
  }, [orgId, activeCategory, visibilityFilter, search, propertyId, availableCategories]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function toggleItem(item: VaultItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        if (!multiple) {
          next.clear();
        }
        next.add(item.id);
      }
      return next;
    });
  }

  function handleConfirm() {
    const selected = items.filter((i) => selectedIds.has(i.id));
    onSelect(selected);
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="flex flex-col gap-4">
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-sage-light text-sage'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {availableCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-sage-light text-sage'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search files…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field"
      />

      {/* Thumbnail grid */}
      <div className="min-h-[240px]">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <span className="text-4xl">🗂️</span>
            <p className="text-sm">No files found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item)}
                  className={`rounded-lg overflow-hidden border-2 transition-all text-left focus:outline-none focus:ring-2 focus:ring-sage ${
                    isSelected
                      ? 'border-sage-light ring-2 ring-sage-light'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <div className="aspect-square bg-gray-50 relative">
                    {isImageMime(item.mime_type) ? (
                      <ThumbnailImage item={item} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-100 p-2">
                        <span className="text-3xl">{CATEGORY_ICONS[item.category]}</span>
                        <span className="text-xs text-gray-500 truncate w-full text-center">
                          {item.file_name}
                        </span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-sage-light rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-sage"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs text-forest-dark truncate">{item.file_name}</p>
                    <p className="text-xs text-gray-400 capitalize">{item.category}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm button */}
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selectedCount === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {selectedCount > 0
            ? `Select${multiple ? ` (${selectedCount})` : ''}`
            : 'Select'}
        </button>
      </div>
    </div>
  );
}
