'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ItemStatus, ItemType, CustomField } from '@/lib/types';
import PhotoUploader from './PhotoUploader';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading map...
    </div>
  ),
});

export default function ItemForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Item types and custom fields from DB
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [status, setStatus] = useState<ItemStatus>('planned');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<File[]>([]);

  // Fetch item types and custom fields
  useEffect(() => {
    async function fetchTypes() {
      const supabase = createClient();
      const { data: types } = await supabase
        .from('item_types')
        .select('*')
        .order('sort_order', { ascending: true });

      if (types) {
        setItemTypes(types);
        if (types.length === 1) {
          setSelectedTypeId(types[0].id);
        }
      }

      const { data: fields } = await supabase
        .from('custom_fields')
        .select('*')
        .order('sort_order', { ascending: true });

      if (fields) setCustomFields(fields);
    }

    fetchTypes();
  }, []);

  // Fields for the selected type
  const typeFields = customFields.filter((f) => f.item_type_id === selectedTypeId);

  function handleCustomFieldChange(fieldId: string, value: string) {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!latitude || !longitude) {
      setError('Please select a location on the map.');
      return;
    }
    if (!selectedTypeId) {
      setError('Please select an item type.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const supabase = createClient();

      // Build custom field values (only non-empty)
      const cfValues: Record<string, unknown> = {};
      for (const [fieldId, value] of Object.entries(customFieldValues)) {
        if (value) {
          const field = customFields.find((f) => f.id === fieldId);
          if (field?.field_type === 'number') {
            cfValues[fieldId] = Number(value);
          } else {
            cfValues[fieldId] = value;
          }
        }
      }

      const { data: item, error: insertError } = await supabase
        .from('items')
        .insert({
          name,
          description: description || null,
          latitude,
          longitude,
          item_type_id: selectedTypeId,
          custom_field_values: cfValues,
          status,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const path = `${item.id}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(path, file);

        if (!uploadError) {
          await supabase.from('photos').insert({
            item_id: item.id,
            storage_path: path,
            is_primary: i === 0,
          });
        }
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Item type selector (only if multiple types) */}
      {itemTypes.length > 1 && (
        <div>
          <label htmlFor="type" className="label">
            Type *
          </label>
          <select
            id="type"
            value={selectedTypeId}
            onChange={(e) => {
              setSelectedTypeId(e.target.value);
              setCustomFieldValues({});
            }}
            className="input-field"
            required
          >
            <option value="">Select type...</option>
            {itemTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="name" className="label">
          Name *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          placeholder="e.g., Meadow View Box #4"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="label">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field min-h-[80px]"
          placeholder="Location details, notes..."
        />
      </div>

      <div>
        <label className="label">Location *</label>
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          onChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
        />
      </div>

      <div>
        <label htmlFor="status" className="label">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ItemStatus)}
          className="input-field w-auto"
        >
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="damaged">Needs Repair</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      {/* Dynamic custom fields */}
      {typeFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-forest-dark">
            {itemTypes.find((t) => t.id === selectedTypeId)?.name} Details
          </h3>
          {typeFields.map((field) => (
            <div key={field.id}>
              <label htmlFor={`cf-${field.id}`} className="label">
                {field.name} {field.required && '*'}
              </label>
              {field.field_type === 'dropdown' && field.options ? (
                <select
                  id={`cf-${field.id}`}
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                  className="input-field"
                  required={field.required}
                >
                  <option value="">Select...</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.field_type === 'date' ? (
                <input
                  id={`cf-${field.id}`}
                  type="date"
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                  className="input-field w-auto"
                  required={field.required}
                />
              ) : field.field_type === 'number' ? (
                <input
                  id={`cf-${field.id}`}
                  type="number"
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                  className="input-field w-auto"
                  required={field.required}
                />
              ) : (
                <input
                  id={`cf-${field.id}`}
                  type="text"
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                  className="input-field"
                  required={field.required}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label">Photos</label>
        <PhotoUploader onPhotosSelected={(files) => setPhotos((prev) => [...prev, ...files])} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Add Item'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
