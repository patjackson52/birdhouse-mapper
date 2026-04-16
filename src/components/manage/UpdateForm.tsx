'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOfflineStore } from '@/lib/offline/provider';
import { useConfig } from '@/lib/config/client';
import { storePhotoBlob } from '@/lib/offline/photo-store';
import { enqueueMutation } from '@/lib/offline/mutations';
import type { Item, ItemType, UpdateType, EntityType, UpdateTypeField } from '@/lib/types';
import { IconRenderer } from '@/components/shared/IconPicker';
import PhotoUploader from './PhotoUploader';
import EntitySelect from './EntitySelect';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem } from '@/lib/location/utils';
import StatusBadge from '@/components/item/StatusBadge';
import { DynamicFieldRenderer, validateFieldValues } from '@/components/shared/fields';
import { canPerformUpdateTypeAction, ROLE_LABELS } from '@/lib/permissions/resolve';
import { usePermissions } from '@/lib/permissions/hooks';

export default function UpdateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedItemId = searchParams.get('item') ?? null;
  const isLocked = preselectedItemId !== null;

  const { userBaseRole } = usePermissions();

  const config = useConfig();
  const propertyId = config.propertyId;
  const offlineStore = useOfflineStore();
  const [orgId, setOrgId] = useState<string | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [updateTypes, setUpdateTypes] = useState<UpdateType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { position } = useUserLocation();
  const [autoSelected, setAutoSelected] = useState(false);
  const hasAttemptedAutoSelect = useRef(false);

  // When locked, seed itemId immediately from URL param
  const [itemId, setItemId] = useState(preselectedItemId ?? '');
  const [updateTypeId, setUpdateTypeId] = useState('');
  const [content, setContent] = useState('');
  const [updateDate, setUpdateDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<Record<string, string[]>>({});
  const [updateTypeFields, setUpdateTypeFields] = useState<UpdateTypeField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    async function fetchData() {
      if (!propertyId) return;

      // Resolve orgId from the properties table in IndexedDB
      const property = await offlineStore.db.properties.get(propertyId);
      const resolvedOrgId = property?.org_id;
      if (!resolvedOrgId) return;
      setOrgId(resolvedOrgId);

      const [itemData, typeData, itData, allEntityTypes, allUpdateTypeFields] = await Promise.all([
        offlineStore.getItems(propertyId),
        offlineStore.getUpdateTypes(resolvedOrgId),
        offlineStore.getItemTypes(resolvedOrgId),
        offlineStore.getEntityTypes(resolvedOrgId),
        offlineStore.getUpdateTypeFields(resolvedOrgId).catch(() => [] as Awaited<ReturnType<typeof offlineStore.getUpdateTypeFields>>),
      ]);

      // Sort items by name for the dropdown
      const sortedItems = [...itemData].sort((a, b) => a.name.localeCompare(b.name));
      setItems(sortedItems);

      if (typeData) {
        setUpdateTypes(typeData);
        // Default to first global type
        const firstGlobal = typeData.find((t) => t.is_global);
        if (firstGlobal) setUpdateTypeId(firstGlobal.id);
      }

      if (itData) setItemTypes(itData);

      if (allUpdateTypeFields) setUpdateTypeFields(allUpdateTypeFields);

      // Filter entity types that link to updates
      const updateEntityTypes = allEntityTypes.filter(
        (et) => Array.isArray(et.link_to) && et.link_to.includes('updates')
      );
      setEntityTypes(updateEntityTypes);
    }

    fetchData();
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select nearest item if within 100m (only when not locked)
  useEffect(() => {
    if (isLocked) return;
    if (hasAttemptedAutoSelect.current) return;
    if (!position || items.length === 0) return;

    hasAttemptedAutoSelect.current = true;
    const AUTO_SELECT_RADIUS = 100; // meters

    let nearest: { id: string; distance: number } | null = null;
    for (const item of items) {
      const d = getDistanceToItem(position, item);
      if (d !== null && d <= AUTO_SELECT_RADIUS) {
        if (!nearest || d < nearest.distance) {
          nearest = { id: item.id, distance: d };
        }
      }
    }

    if (nearest) {
      setItemId(nearest.id);
      setAutoSelected(true);
    }
  }, [position, items, isLocked]);

  // Filter update types: show global ones + ones specific to the selected item's type
  const selectedItem = items.find((i) => i.id === itemId);
  const selectedItemType = selectedItem
    ? itemTypes.find((t) => t.id === selectedItem.item_type_id)
    : undefined;

  const availableUpdateTypes = updateTypes.filter(
    (t) => t.is_global || (selectedItem && t.item_type_id === selectedItem.item_type_id)
  );

  const selectedUpdateTypeFields = updateTypeFields.filter(
    (f) => f.update_type_id === updateTypeId
  );

  function getRoleLabel(updateType: UpdateType): string | null {
    const threshold = updateType.min_role_create;
    if (!threshold) return null;
    return ROLE_LABELS[threshold] ?? null;
  }

  function handleCancel() {
    if (isLocked && preselectedItemId) {
      router.push(`/?item=${preselectedItemId}`);
    } else {
      router.back();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId) {
      setError('Please select an item.');
      return;
    }
    if (!updateTypeId) {
      setError('Please select an update type.');
      return;
    }
    if (!orgId || !propertyId) {
      setError('Missing organization or property context.');
      return;
    }

    // Validate custom fields
    const fieldErrors = validateFieldValues(selectedUpdateTypeFields, customFieldValues);
    if (fieldErrors.length > 0) {
      setError(fieldErrors.map((e) => e.message).join(', '));
      return;
    }

    setError('');
    setSaving(true);

    try {
      const { update, mutationId } = await offlineStore.insertItemUpdate({
        item_id: itemId,
        update_type_id: updateTypeId,
        content: content || null,
        update_date: updateDate,
        org_id: orgId,
        property_id: propertyId,
        custom_field_values: customFieldValues,
      });

      // Store photos as blobs for offline sync
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        await storePhotoBlob(offlineStore.db, {
          mutation_id: mutationId,
          blob: file,
          filename: `${itemId}/updates/${update.id}/${Date.now()}_${i}.jpg`,
          item_id: itemId,
          update_id: update.id,
          is_primary: false,
        });
      }

      // Save entity associations via mutation queue
      const allEntityIds = Object.values(selectedEntityIds).flat();
      for (const entityId of allEntityIds) {
        await enqueueMutation(offlineStore.db, {
          table: 'update_entities',
          operation: 'insert',
          record_id: crypto.randomUUID(),
          payload: { update_id: update.id, entity_id: entityId },
          org_id: orgId,
          property_id: propertyId,
        });
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update.');
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

      {isLocked ? (
        /* Locked item context card */
        <div
          className="flex items-center gap-3 rounded-lg border border-sage-light bg-sage-50 px-3 py-2.5"
          data-testid="locked-item-card"
        >
          {selectedItemType && (
            <span className="text-xl leading-none" aria-hidden="true">
              <IconRenderer icon={selectedItemType.icon} size={24} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-forest-dark">
              {selectedItem?.name ?? '…'}
            </span>
            {selectedItem && (
              <span className="mt-0.5">
                <StatusBadge status={selectedItem.status} />
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Open item select dropdown (default / standalone flow) */
        <div>
          <label htmlFor="item" className="label">
            Item *
          </label>
          <select
            id="item"
            value={itemId}
            onChange={(e) => { setItemId(e.target.value); setAutoSelected(false); }}
            className="input-field"
            required
          >
            <option value="">Select an item...</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {autoSelected && (
            <p className="text-xs text-forest mt-1">
              Auto-selected — you appear to be near this item
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className="label">
            Update Type *
          </label>
          <select
            id="type"
            value={updateTypeId}
            onChange={(e) => { setUpdateTypeId(e.target.value); setCustomFieldValues({}); }}
            className="input-field"
            required
          >
            <option value="">Select type...</option>
            {availableUpdateTypes.map((t) => {
              const roleLabel = getRoleLabel(t);
              const canCreate = canPerformUpdateTypeAction(userBaseRole, t, 'create');
              const isDisabled = canCreate === false;
              return (
                <option key={t.id} value={t.id} disabled={isDisabled}>
                  {t.icon} {t.name}{isDisabled ? ` (${roleLabel} only)` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label htmlFor="update-date" className="label">
            Date
          </label>
          <input
            id="update-date"
            type="date"
            value={updateDate}
            onChange={(e) => setUpdateDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label htmlFor="content" className="label">
          Notes
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="input-field min-h-[100px]"
          placeholder="What did you observe? What work was done?"
          enterKeyHint="done"
        />
      </div>

      {selectedUpdateTypeFields.length > 0 && (
        <DynamicFieldRenderer
          fields={selectedUpdateTypeFields}
          values={customFieldValues}
          onChange={(fieldId, value) =>
            setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }))
          }
        />
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
            {saving ? 'Saving...' : 'Add Update'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
