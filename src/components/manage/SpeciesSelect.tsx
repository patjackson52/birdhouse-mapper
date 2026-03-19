'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';

interface SpeciesSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function SpeciesSelect({ selectedIds, onChange }: SpeciesSelectProps) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from('species')
        .select('*')
        .order('sort_order', { ascending: true });
      if (data) setSpecies(data);
      setLoading(false);
    }
    fetch();
  }, []);

  function toggleSpecies(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function removeSpecies(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  if (loading) return <p className="text-xs text-sage">Loading species...</p>;
  if (species.length === 0) return null;

  const selectedSpecies = species.filter((s) => selectedIds.includes(s.id));
  const unselectedSpecies = species.filter((s) => !selectedIds.includes(s.id));

  return (
    <div>
      {selectedSpecies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedSpecies.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {s.name}
              <button type="button" onClick={() => removeSpecies(s.id)} className="hover:text-red-600">&times;</button>
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
          {selectedIds.length === 0 ? 'Select species...' : '+ Add more'}
        </button>

        {showDropdown && unselectedSpecies.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
            {unselectedSpecies.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSpecies(s.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-light text-forest-dark"
              >
                {s.name}
                {s.scientific_name && <span className="text-sage italic ml-1">({s.scientific_name})</span>}
              </button>
            ))}
          </div>
        )}

        {showDropdown && unselectedSpecies.length === 0 && (
          <div className="absolute z-10 mt-1 w-64 bg-white border border-sage-light rounded-lg shadow-lg p-3 text-xs text-sage">
            All species selected.
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="fixed inset-0 z-[5]" onClick={() => setShowDropdown(false)} />
      )}
    </div>
  );
}
