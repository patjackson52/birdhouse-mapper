'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ItemStatus, ItemType, CustomField, Photo } from '@/lib/types';
import PhotoUploader from './PhotoUploader';
import SpeciesSelect from './SpeciesSelect';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading map...
    </div>
  ),
});

import LocationHistory from './LocationHistory';

interface EditItemFormProps {
  itemId: string;
  initialData: {
    name: string;
    description: string | null;
    latitude: number;
    longitude: number;
    status: ItemStatus;
    item_type_id: string;
    custom_field_values: Record<string, unknown>;
  };
  initialSpeciesIds: string[];
  initialPhotos: Photo[];
  isAdmin: boolean;
}

export default function EditItemForm({
  itemId,
  initialData,
  initialSpeciesIds,
  initialPhotos,
  isAdmin,
}: EditItemFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Item types and custom fields from DB
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState(initialData.item_type_id);

  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description || '');
  const [latitude, setLatitude] = useState<number | null>(initialData.latitude);
  const [longitude, setLongitude] = useState<number | null>(initialData.longitude);
  const [status, setStatus] = useState<ItemStatus>(initialData.status);

  // Cast initial custom field values to strings for form inputs
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const [key, value] of Object.entries(initialData.custom_field_values || {})) {
      vals[key] = String(value ?? '');
    }
    return vals;
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>(initialSpeciesIds);

  // Track existing photos and which ones to remove
  const [existingPhotos] = useState<Photo[]>(initialPhotos);
  const [photosToRemove, setPhotosToRemove] = useState<string[]>([]);

  // Track original location for detecting changes
  const originalLatitude = initialData.latitude;
  const originalLongitude = initialData.longitude;

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

  function togglePhotoRemoval(photoId: string) {
    setPhotosToRemove((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  }

  // Get public URL for an existing photo
  function getPhotoUrl(storagePath: string) {
    const supabase = createClient();
    return supabase.storage.from('item-photos').getPublicUrl(storagePath).data.publicUrl;
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

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be logged in to edit items.');
        setSaving(false);
        return;
      }

      // Build custom field values (only non-empty, only for current type's fields)
      const cfValues: Record<string, unknown> = {};
      const currentTypeFieldIds = customFields
        .filter((f) => f.item_type_id === selectedTypeId)
        .map((f) => f.id);

      for (const [fieldId, value] of Object.entries(customFieldValues)) {
        if (value && currentTypeFieldIds.includes(fieldId)) {
          const field = customFields.find((f) => f.id === fieldId);
          if (field?.field_type === 'number') {
            cfValues[fieldId] = Number(value);
          } else {
            cfValues[fieldId] = value;
          }
        }
      }

      // Update the item
      const { error: updateError } = await supabase
        .from('items')
        .update({
          name,
          description: description || null,
          latitude,
          longitude,
          item_type_id: selectedTypeId,
          custom_field_values: cfValues,
          status,
        })
        .eq('id', itemId);

      if (updateError) throw updateError;

      // If location changed, insert into location_history
      if (latitude !== originalLatitude || longitude !== originalLongitude) {
        const { error: historyError } = await supabase.from('location_history').insert({
          item_id: itemId,
          latitude,
          longitude,
          created_by: user.id,
        });
        if (historyError) throw historyError;
      }

      // Update species: delete all existing, then insert current selection
      await supabase.from('item_species').delete().eq('item_id', itemId);

      if (selectedSpeciesIds.length > 0) {
        await supabase.from('item_species').insert(
          selectedSpeciesIds.map((speciesId) => ({ item_id: itemId, species_id: speciesId }))
        );
      }

      // Handle photo removals
      const remainingExistingPhotos = existingPhotos.filter(
        (p) => !photosToRemove.includes(p.id)
      );

      if (photosToRemove.length > 0) {
        const photosBeingRemoved = existingPhotos.filter((p) =>
          photosToRemove.includes(p.id)
        );

        // Delete photo rows
        await supabase
          .from('photos')
          .delete()
          .in('id', photosToRemove);

        // Delete storage objects
        const pathsToRemove = photosBeingRemoved.map((p) => p.storage_path);
        if (pathsToRemove.length > 0) {
          await supabase.storage.from('item-photos').remove(pathsToRemove);
        }

        // If primary photo was removed, reassign primary
        const primaryRemoved = photosBeingRemoved.some((p) => p.is_primary);
        if (primaryRemoved && remainingExistingPhotos.length > 0) {
          await supabase
            .from('photos')
            .update({ is_primary: true })
            .eq('id', remainingExistingPhotos[0].id);
        }
      }

      // Determine if new photos need a primary:
      // If no existing photos remain, OR if the primary was removed and no existing
      // photos remain to receive it (reassignment above only fires when remaining > 0),
      // then the first new upload should be primary.
      const needsPrimaryFromNew =
        remainingExistingPhotos.length === 0;

      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const path = `${itemId}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(path, file);

        if (!uploadError) {
          await supabase.from('photos').insert({
            item_id: itemId,
            storage_path: path,
            is_primary: needsPrimaryFromNew && i === 0,
          });
        }
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to save changes.';
      setError(message);
      setSaving(false);
    }
  }

  const remainingPhotosForDisplay = existingPhotos.filter(
    (p) => !photosToRemove.includes(p.id)
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-24 md:pb-0">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Item type selector (always shown for editing) */}
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
          enterKeyHint="next"
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
          enterKeyHint="done"
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
        {isAdmin && (
          <LocationHistory
            itemId={itemId}
            onRevert={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
          />
        )}
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
                  inputMode="decimal"
                  enterKeyHint="next"
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

      {/* Existing photos */}
      <div>
        <label className="label">Photos</label>
        {existingPhotos.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {existingPhotos.map((photo) => {
              const markedForRemoval = photosToRemove.includes(photo.id);
              return (
                <div
                  key={photo.id}
                  className={`relative w-20 h-20 rounded-lg overflow-hidden bg-sage-light ${
                    markedForRemoval ? 'opacity-40' : ''
                  }`}
                >
                  <img
                    src={getPhotoUrl(photo.storage_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {photo.is_primary && !markedForRemoval && (
                    <span className="absolute bottom-0.5 left-0.5 bg-forest text-white text-xs px-1 rounded">
                      Primary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePhotoRemoval(photo.id)}
                    className="absolute top-0.5 right-0.5 w-8 h-8 min-w-[44px] min-h-[44px] bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
                  >
                    {markedForRemoval ? '+' : '\u00D7'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {photosToRemove.length > 0 && (
          <p className="text-xs text-amber-600 mb-2">
            {photosToRemove.length} photo{photosToRemove.length !== 1 ? 's' : ''} will be removed on save.
          </p>
        )}
        <PhotoUploader
          onPhotosSelected={(files) => setPhotos((prev) => [...prev, ...files])}
          maxFiles={5 - remainingPhotosForDisplay.length}
        />
      </div>

      <div>
        <label className="label">Species</label>
        <SpeciesSelect selectedIds={selectedSpeciesIds} onChange={setSelectedSpeciesIds} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.12)] p-4 pb-safe md:relative md:shadow-none md:p-0 md:bg-transparent">
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
