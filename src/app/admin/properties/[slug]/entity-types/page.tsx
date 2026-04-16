'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EntityType, EntityTypeField } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EntityTypeForm from '@/components/admin/EntityTypeForm';
import { IconRenderer } from '@/components/shared/IconPicker';

interface EntityTypeWithFields extends EntityType {
  entity_type_fields: EntityTypeField[];
}

export default function EntityTypesPage() {
  const [entityTypes, setEntityTypes] = useState<EntityTypeWithFields[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EntityTypeWithFields | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    fetchEntityTypes();
  }, []);

  async function fetchEntityTypes() {
    const supabase = createClient();

    // Get org_id from the user's membership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!membership) return;
    setOrgId(membership.org_id);

    const { data } = await supabase
      .from('entity_types')
      .select('*, entity_type_fields(*)')
      .eq('org_id', membership.org_id)
      .order('sort_order', { ascending: true });

    if (data) setEntityTypes(data as EntityTypeWithFields[]);
    setLoading(false);
  }

  function handleSaved(saved: EntityType) {
    fetchEntityTypes(); // Re-fetch to get fields
    setEditing(undefined);
    setShowAdd(false);
  }

  async function handleDelete(et: EntityTypeWithFields) {
    setError('');
    const supabase = createClient();

    const { count } = await supabase
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('entity_type_id', et.id);

    if ((count || 0) > 0) {
      setError(`Cannot delete "${et.name}": it has ${count} entities. Delete them first.`);
      return;
    }

    if (!confirm(`Delete entity type "${et.name}" and all its field definitions?`)) return;

    const { error: err } = await supabase.from('entity_types').delete().eq('id', et.id);
    if (err) {
      setError(err.message);
    } else {
      setEntityTypes((prev) => prev.filter((e) => e.id !== et.id));
    }
  }

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Entity Types</h1>
        {!showAdd && !editing && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            + Add Entity Type
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
      )}

      {(showAdd || editing) && orgId && (
        <div className="mb-6">
          <EntityTypeForm
            entityType={editing}
            orgId={orgId}
            onSaved={handleSaved}
            onCancel={() => { setShowAdd(false); setEditing(undefined); }}
          />
        </div>
      )}

      {entityTypes.length === 0 && !showAdd && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No entity types defined yet. Entity types let you track rich, structured data like species, volunteers, or equipment.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            + Add Your First Entity Type
          </button>
        </div>
      )}

      <div className="space-y-3">
        {entityTypes.map((et) => (
          <div key={et.id} className="card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <IconRenderer icon={et.icon} size={24} />
              <div>
                <h3 className="font-medium text-forest-dark">{et.name}</h3>
                <p className="text-xs text-sage">
                  {et.entity_type_fields.length} custom field{et.entity_type_fields.length !== 1 ? 's' : ''}
                  {' · '}
                  Links to: {et.link_to.join(', ')}
                </p>
              </div>
            </div>
            <div className="flex gap-1 flex-wrap">
              <a
                href={`entities/${et.id}`}
                className="text-xs text-forest hover:text-forest-dark py-2 px-3 min-h-[44px] flex items-center"
              >
                Manage
              </a>
              <button onClick={() => setEditing(et)} className="text-xs text-forest hover:text-forest-dark py-2 px-3 min-h-[44px] flex items-center">Edit</button>
              <button onClick={() => handleDelete(et)} className="text-xs text-red-600 hover:text-red-800 py-2 px-3 min-h-[44px] flex items-center">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
