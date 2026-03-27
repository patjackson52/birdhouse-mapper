'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EntityType, EntityTypeField, EntityFieldType, EntityLinkTarget } from '@/lib/types';

interface EntityTypeWithFields extends EntityType {
  entity_type_fields?: EntityTypeField[];
}

interface EntityTypeFormProps {
  entityType?: EntityTypeWithFields;
  orgId: string;
  onSaved: (entityType: EntityType) => void;
  onCancel: () => void;
}

interface FieldDraft {
  id?: string; // existing field ID, undefined for new
  name: string;
  field_type: EntityFieldType;
  options: string[];
  required: boolean;
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
          field_type: f.field_type,
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

  function addField() {
    setFields([...fields, { name: '', field_type: 'text', options: [], required: false }]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<FieldDraft>) {
    setFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setFields(updated);
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
      <div className="space-y-3 pt-2 border-t border-sage-light">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-sage uppercase tracking-wide">Custom Fields</p>
          <button type="button" onClick={addField} className="text-xs text-forest hover:text-forest-dark font-medium">
            + Add Field
          </button>
        </div>

        {fields.map((field, i) => (
          <div key={i} className="flex gap-2 items-start p-3 rounded-lg bg-sage-light/30 border border-sage-light">
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={field.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  className="input-field flex-1"
                  placeholder="Field name"
                />
                <select
                  value={field.field_type}
                  onChange={(e) => updateField(i, { field_type: e.target.value as EntityFieldType })}
                  className="input-field w-auto"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="date">Date</option>
                  <option value="url">URL</option>
                </select>
              </div>
              {field.field_type === 'dropdown' && (
                <input
                  type="text"
                  value={field.options.join(', ')}
                  onChange={(e) => updateField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                  className="input-field text-xs"
                  placeholder="Options (comma-separated)"
                />
              )}
              <label className="flex items-center gap-2 text-xs text-sage">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                  className="rounded border-sage"
                />
                Required
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0} className="text-xs text-sage hover:text-forest-dark disabled:opacity-30">
                ↑
              </button>
              <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} className="text-xs text-sage hover:text-forest-dark disabled:opacity-30">
                ↓
              </button>
              <button type="button" onClick={() => removeField(i)} className="text-xs text-red-600 hover:text-red-800">
                ✕
              </button>
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <p className="text-xs text-sage italic">No custom fields. Every entity already has name, description, photo, and external link.</p>
        )}
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
