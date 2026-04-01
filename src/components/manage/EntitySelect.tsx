'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Entity } from '@/lib/types';

interface EntitySelectProps {
  entityTypeId: string;
  entityTypeName: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function EntitySelect({ entityTypeId, entityTypeName, selectedIds, onChange }: EntitySelectProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: entities = [], isLoading: loading } = useQuery({
    queryKey: ['entities', entityTypeId],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('entities').select('*').eq('entity_type_id', entityTypeId).order('sort_order', { ascending: true });
      return (data ?? []) as Entity[];
    },
  });

  function toggleEntity(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((eid) => eid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function removeEntity(id: string) {
    onChange(selectedIds.filter((eid) => eid !== id));
  }

  if (loading) return <p className="text-xs text-sage">Loading {entityTypeName.toLowerCase()}...</p>;
  if (entities.length === 0) return null;

  const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));
  const unselectedEntities = entities.filter((e) => !selectedIds.includes(e.id));

  return (
    <div>
      {selectedEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedEntities.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {e.name}
              <button type="button" onClick={() => removeEntity(e.id)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-sm text-forest hover:text-forest-dark"
        >
          {selectedIds.length === 0 ? `Select ${entityTypeName.toLowerCase()}...` : '+ Add more'}
        </button>

        {showDropdown && unselectedEntities.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
            {unselectedEntities.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleEntity(e.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-light text-forest-dark"
              >
                {e.name}
                {e.description && <span className="text-sage italic ml-1 text-xs">({e.description})</span>}
              </button>
            ))}
          </div>
        )}

        {showDropdown && unselectedEntities.length === 0 && (
          <div className="absolute z-10 mt-1 w-64 bg-white border border-sage-light rounded-lg shadow-lg p-3 text-xs text-sage">
            All {entityTypeName.toLowerCase()} selected.
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="fixed inset-0 z-[5]" onClick={() => setShowDropdown(false)} />
      )}
    </div>
  );
}
