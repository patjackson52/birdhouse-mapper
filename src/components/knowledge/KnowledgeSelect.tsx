'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgeSelectProps {
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
}

export default function KnowledgeSelect({ orgId, selectedIds, onChange, multiple = true }: KnowledgeSelectProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['knowledge-items', orgId],
    queryFn: async () => {
      const { items } = await getKnowledgeItems(orgId);
      return items;
    },
  });

  function toggleItem(id: string) {
    if (multiple) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((sid) => sid !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setShowDropdown(false);
    }
  }

  function removeItem(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  if (loading) return <p className="text-xs text-sage">Loading knowledge articles…</p>;
  if (items.length === 0) return null;

  const selectedItems = items.filter((i) => selectedIds.includes(i.id));
  const unselectedItems = items.filter((i) => !selectedIds.includes(i.id));

  return (
    <div>
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedItems.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {i.title}
              <button type="button" onClick={() => removeItem(i.id)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="input-field text-sm text-left w-full"
        >
          {selectedItems.length === 0 ? 'Link knowledge article…' : 'Add another…'}
        </button>

        {showDropdown && unselectedItems.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-sage-light rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {unselectedItems.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => toggleItem(i.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-light/50 transition-colors"
              >
                <span className="text-forest-dark">{i.title}</span>
                {i.tags.length > 0 && (
                  <span className="text-sage text-xs ml-2">
                    {i.tags.join(', ')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
