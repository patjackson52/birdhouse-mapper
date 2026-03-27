'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Entity, EntityType, EntityTypeField } from '@/lib/types';
import { resizeImage } from '@/lib/utils';

interface EntityFormProps {
  entityType: EntityType;
  fields: EntityTypeField[];
  entity?: Entity;
  onSaved: (entity: Entity) => void;
  onCancel: () => void;
}

export default function EntityForm({ entityType, fields, entity, onSaved, onCancel }: EntityFormProps) {
  const [name, setName] = useState(entity?.name || '');
  const [description, setDescription] = useState(entity?.description || '');
  const [externalLink, setExternalLink] = useState(entity?.external_link || '');
  const [sortOrder, setSortOrder] = useState(entity?.sort_order ?? 0);

  // Custom field values keyed by field ID
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(() => {
    if (entity?.custom_field_values) return { ...entity.custom_field_values };
    const defaults: Record<string, unknown> = {};
    for (const f of fields) {
      defaults[f.id] = f.field_type === 'number' ? null : '';
    }
    return defaults;
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(() => {
    if (!entity?.photo_path) return null;
    const supabase = createClient();
    const { data } = supabase.storage.from('item-photos').getPublicUrl(entity.photo_path);
    return data.publicUrl;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await resizeImage(file, 800);
      const resized = new File([blob], file.name, { type: 'image/jpeg' });
      setPhotoFile(resized);
      setPhotoPreview(URL.createObjectURL(resized));
      setExistingPhotoUrl(null);
    } catch {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setExistingPhotoUrl(null);
    }
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setExistingPhotoUrl(null);
  }

  function updateCustomValue(fieldId: string, value: unknown) {
    setCustomValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      let photoPath = entity?.photo_path || null;

      if (!photoFile && !existingPhotoUrl && entity?.photo_path) {
        photoPath = null;
      }

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        external_link: externalLink.trim() || null,
        sort_order: sortOrder,
        photo_path: photoPath,
        custom_field_values: customValues,
      };

      if (entity) {
        if (photoFile) {
          const path = `entities/${entity.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          payload.photo_path = path;
        }

        const { data, error: err } = await supabase
          .from('entities')
          .update(payload)
          .eq('id', entity.id)
          .select()
          .single();
        if (err) throw err;
        onSaved(data);
      } else {
        const { data, error: err } = await supabase
          .from('entities')
          .insert({ ...payload, photo_path: null, entity_type_id: entityType.id, org_id: entityType.org_id })
          .select()
          .single();
        if (err) throw err;

        if (photoFile) {
          const path = `entities/${data.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          await supabase.from('entities').update({ photo_path: path }).eq('id', data.id);
          data.photo_path = path;
        }

        onSaved(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">
        {entity ? `Edit ${entityType.name}` : `Add ${entityType.name}`}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Fixed common fields */}
      <div>
        <label className="label">Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field min-h-[80px]" />
      </div>

      <div>
        <label className="label">External Link</label>
        <input type="url" value={externalLink} onChange={(e) => setExternalLink(e.target.value)} className="input-field" placeholder="https://..." />
      </div>

      <div>
        <label className="label">Sort Order</label>
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="input-field w-24" />
      </div>

      {/* Dynamic custom fields */}
      {fields.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-sage-light">
          <p className="text-xs font-medium text-sage uppercase tracking-wide">Custom Fields</p>
          {fields.map((field) => (
            <div key={field.id}>
              <label className="label">{field.name}{field.required ? ' *' : ''}</label>
              {field.field_type === 'text' && (
                <input
                  type="text"
                  value={(customValues[field.id] as string) || ''}
                  onChange={(e) => updateCustomValue(field.id, e.target.value)}
                  className="input-field"
                  required={field.required}
                />
              )}
              {field.field_type === 'url' && (
                <input
                  type="url"
                  value={(customValues[field.id] as string) || ''}
                  onChange={(e) => updateCustomValue(field.id, e.target.value)}
                  className="input-field"
                  placeholder="https://..."
                  required={field.required}
                />
              )}
              {field.field_type === 'number' && (
                <input
                  type="number"
                  value={(customValues[field.id] as number) ?? ''}
                  onChange={(e) => updateCustomValue(field.id, e.target.value ? Number(e.target.value) : null)}
                  className="input-field"
                  required={field.required}
                />
              )}
              {field.field_type === 'date' && (
                <input
                  type="date"
                  value={(customValues[field.id] as string) || ''}
                  onChange={(e) => updateCustomValue(field.id, e.target.value)}
                  className="input-field"
                  required={field.required}
                />
              )}
              {field.field_type === 'dropdown' && field.options && (
                <select
                  value={(customValues[field.id] as string) || ''}
                  onChange={(e) => updateCustomValue(field.id, e.target.value)}
                  className="input-field"
                  required={field.required}
                >
                  <option value="">Select...</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo upload */}
      <div>
        <label className="label">Photo</label>
        {(photoPreview || existingPhotoUrl) && (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-sage-light mb-2">
            <img src={photoPreview || existingPhotoUrl!} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/70"
            >
              &times;
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        {!photoPreview && !existingPhotoUrl && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary text-sm">
            Add Photo
          </button>
        )}
        {(photoPreview || existingPhotoUrl) && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-forest hover:text-forest-dark">
            Replace Photo
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving...' : entity ? `Update ${entityType.name}` : `Add ${entityType.name}`}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}
