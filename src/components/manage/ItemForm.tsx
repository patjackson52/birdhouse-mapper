'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import { storePhotoBlob } from '@/lib/offline/photo-store';
import { enqueueMutation } from '@/lib/offline/mutations';
import type { ItemStatus, ItemType, CustomField, EntityType } from '@/lib/types';
import { iconDisplayName } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import PhotoUploader from './PhotoUploader';
import EntitySelect from './EntitySelect';

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
  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();

  // Item types and custom fields from DB
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [status, setStatus] = useState<ItemStatus>('planned');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<Record<string, string[]>>({});

  // Fetch item types and custom fields
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

      if (types) {
        setItemTypes(types);
        if (types.length === 1) {
          setSelectedTypeId(types[0].id);
        }
      }

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

      const { item, mutationId } = await offlineStore.insertItem({
        name,
        description: description || null,
        latitude,
        longitude,
        item_type_id: selectedTypeId,
        custom_field_values: cfValues,
        status,
        org_id: orgId,
        property_id: propertyId,
      });

      // Store photos as blobs for offline sync
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        await storePhotoBlob(offlineStore.db, {
          mutation_id: mutationId,
          blob: file,
          filename: `${item.id}/${Date.now()}_${i}.jpg`,
          item_id: item.id,
          update_id: null,
          is_primary: i === 0,
        });
      }

      // Save entity associations via mutation queue
      const allEntityIds = Object.values(selectedEntityIds).flat();
      for (const entityId of allEntityIds) {
        await enqueueMutation(offlineStore.db, {
          table: 'item_entities',
          operation: 'insert',
          record_id: crypto.randomUUID(),
          payload: { item_id: item.id, entity_id: entityId },
          org_id: orgId,
          property_id: propertyId,
        });
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-40 md:pb-0">
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
                {iconDisplayName(t.icon)} {t.name}
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

      <div>
        <label className="label">Photos</label>
        <PhotoUploader onPhotosSelected={(files) => setPhotos((prev) => [...prev, ...files])} orgId={orgId ?? undefined} />
      </div>

      {entityTypes.map((et) => (
        <div key={et.id}>
          <label className="label"><IconRenderer icon={et.icon} size={14} /> {et.name}</label>
          <EntitySelect
            entityTypeId={et.id}
            entityTypeName={et.name}
            selectedIds={selectedEntityIds[et.id] || []}
            onChange={(ids) => setSelectedEntityIds((prev) => ({ ...prev, [et.id]: ids }))}
          />
        </div>
      ))}

      <div className="fixed bottom-16 left-0 right-0 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.12)] p-4 pb-safe md:bottom-0 md:relative md:shadow-none md:p-0 md:bg-transparent">
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
      </div>
    </form>
  );
}
