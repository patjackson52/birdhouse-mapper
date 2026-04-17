'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import { storePhotoBlob } from '@/lib/offline/photo-store';
import { enqueueMutation } from '@/lib/offline/mutations';
import { createClient } from '@/lib/supabase/client';
import type { ItemStatus, ItemType, CustomField, Photo, EntityType } from '@/lib/types';
import { iconDisplayName } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import PhotoUploader from './PhotoUploader';
import EntitySelect from '@/components/manage/EntitySelect';
import SpeciesPicker from '@/components/manage/SpeciesPicker';

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
  initialEntityIds: Record<string, string[]>;
  initialPhotos: Photo[];
  isAdmin: boolean;
}

export default function EditItemForm({
  itemId,
  initialData,
  initialEntityIds,
  initialPhotos,
  isAdmin,
}: EditItemFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();
  const [orgId, setOrgId] = useState<string | null>(null);

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
  const [selectedEntityIds, setSelectedEntityIds] = useState<Record<string, string[]>>(initialEntityIds);

  // Entity types that link to items
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);

  // Track existing photos and which ones to remove
  const [existingPhotos] = useState<Photo[]>(initialPhotos);
  const [photosToRemove, setPhotosToRemove] = useState<string[]>([]);

  // Track original location for detecting changes
  const originalLatitude = initialData.latitude;
  const originalLongitude = initialData.longitude;

  // Fetch item types, custom fields, and entity types from offline store
  useEffect(() => {
    async function fetchTypes() {
      if (!propertyId) return;

      // Resolve orgId from the properties table in IndexedDB
      const property = await offlineStore.db.properties.get(propertyId);
      const resolvedOrgId = property?.org_id;
      if (!resolvedOrgId) return;
      setOrgId(resolvedOrgId);

      const [types, fields, allEntityTypes] = await Promise.all([
        offlineStore.getItemTypes(resolvedOrgId),
        offlineStore.getCustomFields(resolvedOrgId),
        offlineStore.getEntityTypes(resolvedOrgId),
      ]);

      if (types) setItemTypes(types);
      if (fields) setCustomFields(fields);

      // Filter entity types that link to items
      const itemEntityTypes = allEntityTypes.filter(
        (et) => Array.isArray(et.link_to) && et.link_to.includes('items')
      );
      setEntityTypes(itemEntityTypes);
    }

    fetchTypes();
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return supabase.storage.from('vault-public').getPublicUrl(storagePath).data.publicUrl;
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
    if (!orgId || !propertyId) {
      setError('Missing organization or property context.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      // Get current user (for location_history created_by)
      let userId: string | null = null;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        // Offline — userId will be null
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

      // Update the item via offline store
      const { mutationId } = await offlineStore.updateItem(
        itemId,
        {
          name,
          description: description || null,
          latitude,
          longitude,
          item_type_id: selectedTypeId,
          custom_field_values: cfValues,
          status,
        },
        orgId,
        propertyId,
      );

      // If location changed, enqueue location_history insert
      if (latitude !== originalLatitude || longitude !== originalLongitude) {
        await enqueueMutation(offlineStore.db, {
          table: 'location_history',
          operation: 'insert',
          record_id: crypto.randomUUID(),
          payload: {
            item_id: itemId,
            latitude,
            longitude,
            created_by: userId,
          },
          org_id: orgId,
          property_id: propertyId,
        });
      }

      // Update entities: enqueue delete all existing, then insert current selection
      await enqueueMutation(offlineStore.db, {
        table: 'item_entities',
        operation: 'delete',
        record_id: itemId,
        payload: { item_id: itemId },
        org_id: orgId,
        property_id: propertyId,
      });

      const allEntityIds = Object.values(selectedEntityIds).flat();
      for (const entityId of allEntityIds) {
        await enqueueMutation(offlineStore.db, {
          table: 'item_entities',
          operation: 'insert',
          record_id: crypto.randomUUID(),
          payload: { item_id: itemId, entity_id: entityId },
          org_id: orgId,
          property_id: propertyId,
        });
      }

      // Handle photo removals via mutation queue
      const remainingExistingPhotos = existingPhotos.filter(
        (p) => !photosToRemove.includes(p.id)
      );

      if (photosToRemove.length > 0) {
        for (const photoId of photosToRemove) {
          await enqueueMutation(offlineStore.db, {
            table: 'photos',
            operation: 'delete',
            record_id: photoId,
            payload: { id: photoId },
            org_id: orgId,
            property_id: propertyId,
          });
        }

        // Also remove from local IndexedDB cache
        for (const photoId of photosToRemove) {
          await offlineStore.db.photos.delete(photoId);
        }

        // If primary photo was removed, reassign primary
        const photosBeingRemoved = existingPhotos.filter((p) =>
          photosToRemove.includes(p.id)
        );
        const primaryRemoved = photosBeingRemoved.some((p) => p.is_primary);
        if (primaryRemoved && remainingExistingPhotos.length > 0) {
          await enqueueMutation(offlineStore.db, {
            table: 'photos',
            operation: 'update',
            record_id: remainingExistingPhotos[0].id,
            payload: { is_primary: true },
            org_id: orgId,
            property_id: propertyId,
          });
        }
      }

      // Store new photos as blobs for offline sync
      const needsPrimaryFromNew = remainingExistingPhotos.length === 0;

      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        await storePhotoBlob(offlineStore.db, {
          mutation_id: mutationId,
          blob: file,
          filename: `${itemId}/${Date.now()}_${i}.jpg`,
          item_id: itemId,
          update_id: null,
          is_primary: needsPrimaryFromNew && i === 0,
        });
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
    <form onSubmit={handleSubmit} className="space-y-6 pb-40 md:pb-0">
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
              {iconDisplayName(t.icon)} {t.name}
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
          orgId={orgId ?? undefined}
        />
      </div>

      {entityTypes.map((et) => (
        <div key={et.id}>
          <label className="label">
            <IconRenderer icon={et.icon} size={14} /> {et.name}
          </label>
          {et.api_source === 'inaturalist' && orgId ? (
            <SpeciesPicker
              entityTypeId={et.id}
              entityTypeName={et.name}
              orgId={orgId}
              selectedIds={selectedEntityIds[et.id] || []}
              onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
              lat={latitude ?? undefined}
              lng={longitude ?? undefined}
            />
          ) : (
            <EntitySelect
              entityTypeId={et.id}
              entityTypeName={et.name}
              selectedIds={selectedEntityIds[et.id] || []}
              onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
            />
          )}
        </div>
      ))}

      <div className="fixed bottom-16 left-0 right-0 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.12)] p-4 pb-safe md:bottom-0 md:relative md:shadow-none md:p-0 md:bg-transparent">
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
