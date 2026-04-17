'use client';

import { useMemo } from 'react';
import type { Entity, EntityType, EntityTypeField } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { IconRenderer } from '@/components/shared/IconPicker';

interface EntityCardProps {
  entity: Entity;
  entityType: EntityType;
  fields: EntityTypeField[];
  onEdit: () => void;
  onDelete: () => void;
}

export default function EntityCard({ entity, entityType, fields, onEdit, onDelete }: EntityCardProps) {
  const photoUrl = useMemo(() => {
    if (entity.photo_path) {
      return createClient()
        .storage.from('vault-public')
        .getPublicUrl(entity.photo_path).data.publicUrl;
    }
    const fromCustom = entity.custom_field_values?.photo_url;
    if (typeof fromCustom === 'string' && fromCustom.length > 0) {
      return fromCustom;
    }
    return null;
  }, [entity.photo_path, entity.custom_field_values]);

  const fieldValues = fields
    .map((f) => ({ name: f.name, value: entity.custom_field_values[f.id] }))
    .filter((fv) => fv.value != null && fv.value !== '');

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-32 bg-sage-light flex items-center justify-center">
        {photoUrl ? (
          <img src={photoUrl} alt={entity.name} className="w-full h-full object-cover" />
        ) : (
          <IconRenderer icon={entityType.icon} size={30} />
        )}
      </div>

      <div className="p-3">
        <h3 className="font-medium text-forest-dark text-sm">{entity.name}</h3>
        {entity.description && (
          <p className="text-xs text-sage line-clamp-2 mt-0.5">{entity.description}</p>
        )}

        {fieldValues.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {fieldValues.map((fv) => (
              <span key={fv.name} className="text-xs bg-sage-light text-sage px-2 py-0.5 rounded">
                {String(fv.value)}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3 pt-2 border-t border-sage-light">
          <button onClick={onEdit} className="text-xs text-forest hover:text-forest-dark">Edit</button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:text-red-800">Delete</button>
          {entity.external_link && (
            <a href={entity.external_link} target="_blank" rel="noopener noreferrer" className="text-xs text-forest hover:text-forest-dark ml-auto">
              Link ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
