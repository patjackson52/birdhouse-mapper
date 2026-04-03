'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EntityType, EntityTypeField, EntityLinkTarget } from '@/lib/types';
import { FieldDefinitionEditor, type FieldDraft } from '@/components/shared/fields';

interface EntityTypeWithFields extends EntityType {
  entity_type_fields?: EntityTypeField[];
}

interface EntityTypeFormProps {
  entityType?: EntityTypeWithFields;
  orgId: string;
  onSaved: (entityType: EntityType) => void;
  onCancel: () => void;
}

export default function EntityTypeForm({ entityType, orgId, onSaved, onCancel }: EntityTypeFormProps) {
  const [name, setName] = useState(entityType?.name || '');
  const [icon, setIcon] = useState(entityType?.icon || '📋');
  const [color, setColor] = useState(entityType?.color || '#5D7F3A');
  const [linkTo, setLinkTo] = useState<EntityLinkTarget[]>(entityType?.link_to || ['items', 'updates']);

  const [fields, setFields] = useState<FieldDraft[]>(() => {
    if (entityType?.entity_type_fields) {
      return entityType.entity_type_fields
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((f) => ({
          id: f.id,
          name: f.name,
          // 'url' is a valid EntityFieldType but not yet supported by FieldDefinitionEditor;
          // fall back to 'text' so existing url fields don't lose their data silently.
          field_type: (f.field_type === 'url' ? 'text' : f.field_type) as FieldDraft['field_type'],
          options: f.options || [],
          required: f.required,
        }));
    }
    return [];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleLinkTo(target: EntityLinkTarget) {
    if (linkTo.includes(target)) {
      if (linkTo.length > 1) {
        setLinkTo(linkTo.filter((t) => t !== target));
      }
    } else {
      setLinkTo([...linkTo, target]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');

    try {
      const supabase = createClient();

      const payload = {
        name: name.trim(),
        icon,
        color,
        link_to: linkTo,
        org_id: orgId,
      };

      let savedEntityType: EntityType;

      if (entityType) {
        const { data, error: err } = await supabase
          .from('entity_types')
          .update(payload)
          .eq('id', entityType.id)
          .select()
          .single();
        if (err) throw err;
        savedEntityType = data;
      } else {
        const { data, error: err } = await supabase
          .from('entity_types')
          .insert(payload)
          .select()
          .single();
        if (err) throw err;
        savedEntityType = data;
      }

      // Sync fields: delete removed, upsert remaining
      const entityTypeId = savedEntityType.id;

      if (entityType) {
        // Delete fields that were removed
        const keepIds = fields.filter((f) => f.id).map((f) => f.id!);
        const existingIds = (entityType.entity_type_fields || []).map((f) => f.id);
        const toDelete = existingIds.filter((id) => !keepIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('entity_type_fields').delete().in('id', toDelete);
        }
      }

      // Upsert each field
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const fieldPayload = {
          entity_type_id: entityTypeId,
          org_id: orgId,
          name: field.name.trim(),
          field_type: field.field_type,
          options: field.field_type === 'dropdown' && field.options.length > 0 ? field.options : null,
          required: field.required,
          sort_order: i,
        };

        if (field.id) {
          await supabase.from('entity_type_fields').update(fieldPayload).eq('id', field.id);
        } else {
          await supabase.from('entity_type_fields').insert(fieldPayload);
        }
      }

      onSaved(savedEntityType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entity type.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">
        {entityType ? 'Edit Entity Type' : 'Add Entity Type'}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="e.g., Species" required />
        </div>
        <div className="flex gap-3">
          <div>
            <label className="label">Icon</label>
            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="input-field w-16 text-center text-lg" maxLength={4} />
          </div>
          <div>
            <label className="label">Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded border border-sage-light cursor-pointer" />
          </div>
        </div>
      </div>

      <div>
        <label className="label">Link To</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-forest-dark">
            <input
              type="checkbox"
              checked={linkTo.includes('items')}
              onChange={() => toggleLinkTo('items')}
              className="rounded border-sage"
            />
            Items
          </label>
          <label className="flex items-center gap-2 text-sm text-forest-dark">
            <input
              type="checkbox"
              checked={linkTo.includes('updates')}
              onChange={() => toggleLinkTo('updates')}
              className="rounded border-sage"
            />
            Updates
          </label>
        </div>
      </div>

      {/* Custom Fields Editor */}
      <div className="pt-2 border-t border-sage-light">
          <FieldDefinitionEditor
            fields={fields}
            onChange={setFields}
          />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving...' : entityType ? 'Update Entity Type' : 'Create Entity Type'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}
