'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Entity, EntityType, EntityTypeField } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EntityForm from '@/components/admin/EntityForm';
import EntityCard from '@/components/admin/EntityCard';

export default function EntitiesPage() {
  const params = useParams();
  const entityTypeId = params.entityTypeId as string;
  const queryClient = useQueryClient();

  const [editingEntity, setEditingEntity] = useState<Entity | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin', 'property', 'entities', entityTypeId],
    queryFn: async () => {
      const supabase = createClient();

      const [etRes, entitiesRes] = await Promise.all([
        supabase
          .from('entity_types')
          .select('*, entity_type_fields(*)')
          .eq('id', entityTypeId)
          .single(),
        supabase
          .from('entities')
          .select('*')
          .eq('entity_type_id', entityTypeId)
          .order('sort_order', { ascending: true }),
      ]);

      const entityType = etRes.data ? (etRes.data as EntityType) : null;
      const fields = etRes.data
        ? ((etRes.data as EntityType & { entity_type_fields: EntityTypeField[] }).entity_type_fields || [])
            .sort((a: EntityTypeField, b: EntityTypeField) => a.sort_order - b.sort_order)
        : [];
      const entities: Entity[] = entitiesRes.data ?? [];

      return { entityType, fields, entities };
    },
  });

  const entityType = data?.entityType ?? null;
  const fields = data?.fields ?? [];
  const entities = data?.entities ?? [];

  async function handleSaved(_saved: Entity) {
    setEditingEntity(undefined);
    setShowAdd(false);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'property', 'entities', entityTypeId] });
  }

  async function handleDelete(entity: Entity) {
    setError('');
    const supabase = createClient();

    const [itemRes, updateRes] = await Promise.all([
      supabase.from('item_entities').select('*', { count: 'exact', head: true }).eq('entity_id', entity.id),
      supabase.from('update_entities').select('*', { count: 'exact', head: true }).eq('entity_id', entity.id),
    ]);

    const itemCount = itemRes.count || 0;
    const updateCount = updateRes.count || 0;

    if (itemCount > 0 || updateCount > 0) {
      setError(`Cannot delete "${entity.name}": associated with ${itemCount} item${itemCount === 1 ? '' : 's'} and ${updateCount} update${updateCount === 1 ? '' : 's'}.`);
      return;
    }

    if (!confirm(`Delete "${entity.name}"?`)) return;

    const { error: err } = await supabase.from('entities').delete().eq('id', entity.id);
    if (err) {
      setError(err.message);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'property', 'entities', entityTypeId] });
    }
  }

  const filtered = entities.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q);
  });

  if (loading) return <LoadingSpinner className="py-12" />;
  if (!entityType) return <div className="py-12 text-center text-sage">Entity type not found.</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark flex items-center gap-2">
          <IconRenderer icon={entityType.icon} size={24} /> {entityType.name}
        </h1>
        {!showAdd && !editingEntity && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            + Add {entityType.name}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
      )}

      {(showAdd || editingEntity) && (
        <div className="mb-6">
          <EntityForm
            entityType={entityType}
            fields={fields}
            entity={editingEntity}
            onSaved={handleSaved}
            onCancel={() => { setShowAdd(false); setEditingEntity(undefined); }}
          />
        </div>
      )}

      {entities.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field max-w-md"
            placeholder="Search by name..."
          />
        </div>
      )}

      {entities.length === 0 && !showAdd && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No {entityType.name.toLowerCase()} added yet.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            + Add Your First {entityType.name}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            entityType={entityType}
            fields={fields}
            onEdit={() => setEditingEntity(entity)}
            onDelete={() => handleDelete(entity)}
          />
        ))}
      </div>

      {entities.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sage py-8">No {entityType.name.toLowerCase()} match your search.</p>
      )}
    </div>
  );
}
