'use client';

import { useMemo } from 'react';
import type { Species } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface SpeciesCardProps {
  species: Species;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SpeciesCard({ species, onEdit, onDelete }: SpeciesCardProps) {
  const photoUrl = useMemo(() => {
    if (!species.photo_path) return null;
    return createClient().storage.from('item-photos').getPublicUrl(species.photo_path).data.publicUrl;
  }, [species.photo_path]);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-32 bg-sage-light flex items-center justify-center">
        {photoUrl ? (
          <img src={photoUrl} alt={species.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">🐦</span>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-medium text-forest-dark text-sm">{species.name}</h3>
        {species.scientific_name && (
          <p className="text-xs text-sage italic">{species.scientific_name}</p>
        )}

        <div className="flex flex-wrap gap-1 mt-2">
          {species.category && (
            <span className="text-xs bg-sage-light text-sage px-2 py-0.5 rounded">{species.category}</span>
          )}
          {species.conservation_status && (
            <span className="text-xs bg-sage-light text-sage px-2 py-0.5 rounded">{species.conservation_status}</span>
          )}
        </div>

        <div className="flex gap-2 mt-3 pt-2 border-t border-sage-light">
          <button onClick={onEdit} className="text-xs text-forest hover:text-forest-dark">Edit</button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:text-red-800">Delete</button>
          {species.external_link && (
            <a href={species.external_link} target="_blank" rel="noopener noreferrer" className="text-xs text-forest hover:text-forest-dark ml-auto">
              Link ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
