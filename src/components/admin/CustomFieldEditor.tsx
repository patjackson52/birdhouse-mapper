'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CustomField, FieldType } from '@/lib/types';

interface CustomFieldEditorProps {
  itemTypeId: string;
}

export default function CustomFieldEditor({ itemTypeId }: CustomFieldEditorProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<FieldType>('text');
  const [formRequired, setFormRequired] = useState(false);
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFields();
  }, [itemTypeId]);

  async function fetchFields() {
    const supabase = createClient();
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('item_type_id', itemTypeId)
      .order('sort_order', { ascending: true });
    if (data) setFields(data);
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormType('text');
    setFormRequired(false);
    setFormOptions([]);
    setEditingId(null);
    setShowAdd(false);
    setError('');
  }

  function startEdit(field: CustomField) {
    setFormName(field.name);
    setFormType(field.field_type);
    setFormRequired(field.required);
    setFormOptions(field.options || []);
    setEditingId(field.id);
    setShowAdd(false);
  }

  function startAdd() {
    resetForm();
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const payload = {
        name: formName.trim(),
        field_type: formType,
        required: formRequired,
        options: formType === 'dropdown' ? formOptions.filter((o) => o.trim()) : null,
        item_type_id: itemTypeId,
      };

      if (editingId) {
        const { error: err } = await supabase.from('custom_fields').update(payload).eq('id', editingId);
        if (err) throw err;
        setFields((prev) => prev.map((f) => (f.id === editingId ? { ...f, ...payload } : f)));
      } else {
        const maxSort = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) : -1;
        const { data, error: err } = await supabase
          .from('custom_fields')
          .insert({ ...payload, sort_order: maxSort + 1 })
          .select()
          .single();
        if (err) throw err;
        setFields((prev) => [...prev, data]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save field.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom field? Existing item data for this field will be orphaned.')) return;
    const supabase = createClient();
    const { error: err } = await supabase.from('custom_fields').delete().eq('id', id);
    if (!err) {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) resetForm();
    }
  }

  function addOption() {
    setFormOptions([...formOptions, '']);
  }

  function removeOption(index: number) {
    setFormOptions(formOptions.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setFormOptions(formOptions.map((o, i) => (i === index ? value : o)));
  }

  if (loading) return <p className="text-sm text-sage">Loading fields...</p>;

  const isEditing = editingId !== null || showAdd;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-forest-dark">Custom Fields</h4>
        {!isEditing && (
          <button onClick={startAdd} className="text-xs text-forest hover:text-forest-dark">
            + Add Field
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2">{error}</div>
      )}

      {fields.length > 0 && (
        <div className="space-y-1 mb-3">
          {fields.map((field) => (
            <div key={field.id} className="flex items-center gap-2 text-sm py-1">
              <span className="text-forest-dark flex-1">{field.name}</span>
              <span className="text-xs text-sage bg-sage-light px-2 py-0.5 rounded">{field.field_type}</span>
              {field.required && <span className="text-xs text-amber-600">required</span>}
              <button onClick={() => startEdit(field)} className="text-xs text-forest hover:text-forest-dark">
                Edit
              </button>
              <button onClick={() => handleDelete(field.id)} className="text-xs text-red-600 hover:text-red-800">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {fields.length === 0 && !isEditing && (
        <p className="text-xs text-sage italic mb-2">No custom fields yet.</p>
      )}

      {isEditing && (
        <div className="bg-sage-light rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Field Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="label text-xs">Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as FieldType)} className="input-field text-sm">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-forest-dark">
            <input type="checkbox" checked={formRequired} onChange={(e) => setFormRequired(e.target.checked)} />
            Required
          </label>

          {formType === 'dropdown' && (
            <div>
              <label className="label text-xs">Options</label>
              {formOptions.map((opt, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    type="text" value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="input-field text-sm flex-1" placeholder={`Option ${i + 1}`}
                  />
                  <button type="button" onClick={() => removeOption(i)} className="text-xs text-red-600 px-2">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addOption} className="text-xs text-forest hover:text-forest-dark">
                + Add Option
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : editingId ? 'Update Field' : 'Add Field'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
