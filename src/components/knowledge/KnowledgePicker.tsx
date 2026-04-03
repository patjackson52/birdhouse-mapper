'use client';

import { useState, useEffect } from 'react';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgePickerProps {
  orgId: string;
  onSelect: (items: KnowledgeItem[]) => void;
  onClose: () => void;
  multiple?: boolean;
  tagFilter?: string[];
}

export default function KnowledgePicker({ orgId, onSelect, onClose, multiple = false, tagFilter }: KnowledgePickerProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Collect all unique tags from items
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters: { search?: string; tags?: string[] } = {};
      if (search.trim()) filters.search = search.trim();
      const tagsToFilter = activeTags.length > 0 ? activeTags : tagFilter;
      if (tagsToFilter && tagsToFilter.length > 0) filters.tags = tagsToFilter;

      const { items: data } = await getKnowledgeItems(orgId, filters);
      setItems(data);
      setLoading(false);
    }
    load();
  }, [orgId, search, activeTags, tagFilter]);

  function toggleItem(id: string) {
    if (multiple) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([id]));
    }
  }

  function handleSelect() {
    const selected = items.filter((i) => selectedIds.has(i.id));
    onSelect(selected);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleBackdropClick}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md sm:max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-forest-dark">Select Knowledge Article</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 pt-4 space-y-3">
          <input
            type="search"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field text-sm w-full"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    activeTags.includes(tag)
                      ? 'bg-sage text-white'
                      : 'bg-sage-light text-forest-dark hover:bg-sage/20'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-16 bg-sage-light rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-sage text-center py-8">No articles found.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedIds.has(item.id)
                      ? 'border-sage bg-sage/5'
                      : 'border-gray-100 hover:border-sage-light'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.cover_image_url && (
                      <img src={item.cover_image_url} alt="" className="w-12 h-12 object-cover rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-forest-dark truncate">{item.title}</p>
                      {item.excerpt && (
                        <p className="text-xs text-sage mt-1 line-clamp-2">{item.excerpt}</p>
                      )}
                      {item.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {item.tags.map((tag) => (
                            <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedIds.has(item.id) && (
                      <span className="text-sage text-lg">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSelect}
            disabled={selectedIds.size === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Select{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
