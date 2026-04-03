'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FieldDefinitionEditor, type FieldDraft } from '@/components/shared/fields';
import { MIN_ROLE_OPTIONS } from '@/lib/permissions/resolve';
import type { UpdateType, UpdateTypeField } from '@/lib/types';

interface UpdateTypeEditorProps {
  itemTypeId: string;
}

export default function UpdateTypeEditor({ itemTypeId }: UpdateTypeEditorProps) {
  const [typeSpecific, setTypeSpecific] = useState<UpdateType[]>([]);
  const [globalTypes, setGlobalTypes] = useState<UpdateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('📝');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FieldDraft[]>>({});
  const [updateTypeFields, setUpdateTypeFields] = useState<UpdateTypeField[]>([]);
  const [formMinRoleCreate, setFormMinRoleCreate] = useState<string>('');
  const [formMinRoleEdit, setFormMinRoleEdit] = useState<string>('');
  const [formMinRoleDelete, setFormMinRoleDelete] = useState<string>('');

  useEffect(() => {
    fetchTypes();
  }, [itemTypeId]);

  async function fetchTypes() {
    const supabase = createClient();
    const [{ data: typeData }, { data: fieldData }] = await Promise.all([
      supabase.from('update_types').select('*').order('sort_order', { ascending: true }),
      supabase.from('update_type_fields').select('*').order('sort_order', { ascending: true }),
    ]);

    if (typeData) {
      setGlobalTypes(typeData.filter((t: UpdateType) => t.is_global));
      setTypeSpecific(typeData.filter((t: UpdateType) => !t.is_global && t.item_type_id === itemTypeId));
    }
    if (fieldData) {
      setUpdateTypeFields(fieldData);
    }
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormIcon('📝');
    setEditingId(null);
    setShowAdd(false);
    setError('');
    setFormMinRoleCreate('');
    setFormMinRoleEdit('');
    setFormMinRoleDelete('');
  }

  function startEdit(ut: UpdateType) {
    setFormName(ut.name);
    setFormIcon(ut.icon);
    setEditingId(ut.id);
    setFormMinRoleCreate(ut.min_role_create ?? '');
    setFormMinRoleEdit(ut.min_role_edit ?? '');
    setFormMinRoleDelete(ut.min_role_delete ?? '');

    const existingFields = updateTypeFields
      .filter((f) => f.update_type_id === ut.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id,
        name: f.name,
        field_type: f.field_type as FieldDraft['field_type'],
        options: Array.isArray(f.options) ? f.options : [],
        required: f.required,
      }));
    setFieldDrafts((prev) => ({ ...prev, [ut.id]: existingFields }));
    setShowAdd(false);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const rolePayload = {
        min_role_create: formMinRoleCreate || null,
        min_role_edit: formMinRoleEdit || null,
        min_role_delete: formMinRoleDelete || null,
      };

      let updateTypeId: string;

      if (editingId) {
        const { error: err } = await supabase
          .from('update_types')
          .update({ name: formName.trim(), icon: formIcon, ...rolePayload })
          .eq('id', editingId);
        if (err) throw err;
        updateTypeId = editingId;
        setTypeSpecific((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, name: formName.trim(), icon: formIcon, ...rolePayload } : t))
        );
      } else {
        const maxSort = typeSpecific.length > 0
          ? Math.max(...typeSpecific.map((t) => t.sort_order))
          : (globalTypes.length > 0 ? Math.max(...globalTypes.map((t) => t.sort_order)) : -1);
        const { data, error: err } = await supabase
          .from('update_types')
          .insert({
            name: formName.trim(), icon: formIcon, is_global: false,
            item_type_id: itemTypeId, sort_order: maxSort + 1, ...rolePayload,
          })
          .select()
          .single();
        if (err) throw err;
        updateTypeId = data.id;
        setTypeSpecific((prev) => [...prev, data]);
      }

      // Sync custom fields
      const drafts = fieldDrafts[updateTypeId] ?? [];
      const keepIds = drafts.filter((f) => f.id).map((f) => f.id!);
      const existingIds = updateTypeFields.filter((f) => f.update_type_id === updateTypeId).map((f) => f.id);
      const toDelete = existingIds.filter((id) => !keepIds.includes(id));

      if (toDelete.length > 0) {
        await supabase.from('update_type_fields').delete().in('id', toDelete);
      }

      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i];
        const fieldPayload = {
          update_type_id: updateTypeId,
          name: draft.name.trim(),
          field_type: draft.field_type,
          options: draft.field_type === 'dropdown' && draft.options.length > 0 ? draft.options : null,
          required: draft.required,
          sort_order: i,
        };
        if (draft.id) {
          await supabase.from('update_type_fields').update(fieldPayload).eq('id', draft.id);
        } else {
          await supabase.from('update_type_fields').insert(fieldPayload);
        }
      }

      // Refresh fields for the saved type
      const { data: refreshedFields } = await supabase
        .from('update_type_fields').select('*').eq('update_type_id', updateTypeId).order('sort_order', { ascending: true });
      if (refreshedFields) {
        setUpdateTypeFields((prev) => [
          ...prev.filter((f) => f.update_type_id !== updateTypeId),
          ...refreshedFields,
        ]);
      }

      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();

    const { count } = await supabase
      .from('item_updates')
      .select('*', { count: 'exact', head: true })
      .eq('update_type_id', id);

    if (count && count > 0) {
      setError(`Cannot delete: ${count} observation${count === 1 ? '' : 's'} use this update type.`);
      return;
    }

    if (!confirm('Delete this update type?')) return;
    const { error: err } = await supabase.from('update_types').delete().eq('id', id);
    if (!err) {
      setTypeSpecific((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
    }
  }

  if (loading) return <p className="text-sm text-sage">Loading update types...</p>;

  const isEditing = editingId !== null || showAdd;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-forest-dark">Update Types</h4>
        {!isEditing && (
          <button onClick={() => { resetForm(); setShowAdd(true); }} className="text-xs text-forest hover:text-forest-dark">
            + Add Update Type
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2">{error}</div>
      )}

      {globalTypes.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-sage mb-1">Global (all types):</p>
          <div className="flex flex-wrap gap-2">
            {globalTypes.map((t) => (
              <span key={t.id} className="text-xs bg-sage-light text-sage px-2 py-1 rounded">
                {t.icon} {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {typeSpecific.length > 0 && (
        <div className="space-y-1 mb-3">
          <p className="text-xs text-sage mb-1">Type-specific:</p>
          {typeSpecific.map((ut) => (
            <div key={ut.id} className="flex items-center gap-2 text-sm py-1">
              <span>{ut.icon}</span>
              <span className="text-forest-dark flex-1">{ut.name}</span>
              <button onClick={() => startEdit(ut)} className="text-xs text-forest hover:text-forest-dark">Edit</button>
              <button onClick={() => handleDelete(ut.id)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
            </div>
          ))}
        </div>
      )}

      {typeSpecific.length === 0 && !isEditing && (
        <p className="text-xs text-sage italic mb-2">No type-specific update types.</p>
      )}

      {isEditing && (
        <div className="bg-sage-light rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="label text-xs">Icon (emoji)</label>
              <input type="text" value={formIcon} onChange={(e) => setFormIcon(e.target.value)} className="input-field text-sm" />
            </div>
          </div>

          {/* Custom fields editor */}
          <FieldDefinitionEditor
            fields={editingId ? (fieldDrafts[editingId] ?? []) : (fieldDrafts['new'] ?? [])}
            onChange={(newFields) =>
              setFieldDrafts((prev) => ({ ...prev, [editingId ?? 'new']: newFields }))
            }
          />

          {/* Role thresholds */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-sage">Role Restrictions</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Create', value: formMinRoleCreate, setter: setFormMinRoleCreate },
                { label: 'Edit', value: formMinRoleEdit, setter: setFormMinRoleEdit },
                { label: 'Delete', value: formMinRoleDelete, setter: setFormMinRoleDelete },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="label text-xs">{label}</label>
                  <select value={value} onChange={(e) => setter(e.target.value)} className="input-field text-xs">
                    {MIN_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
