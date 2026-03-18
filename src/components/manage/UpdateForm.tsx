'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Item, UpdateType } from '@/lib/types';
import PhotoUploader from './PhotoUploader';
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem } from '@/lib/location/utils';

export default function UpdateForm() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [updateTypes, setUpdateTypes] = useState<UpdateType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { position } = useUserLocation();
  const [autoSelected, setAutoSelected] = useState(false);
  const hasAttemptedAutoSelect = useRef(false);

  const [itemId, setItemId] = useState('');
  const [updateTypeId, setUpdateTypeId] = useState('');
  const [content, setContent] = useState('');
  const [updateDate, setUpdateDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [photos, setPhotos] = useState<File[]>([]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: itemData } = await supabase
        .from('items')
        .select('*')
        .neq('status', 'removed')
        .order('name', { ascending: true });

      if (itemData) setItems(itemData);

      const { data: typeData } = await supabase
        .from('update_types')
        .select('*')
        .order('sort_order', { ascending: true });

      if (typeData) {
        setUpdateTypes(typeData);
        // Default to first global type
        const firstGlobal = typeData.find((t) => t.is_global);
        if (firstGlobal) setUpdateTypeId(firstGlobal.id);
      }
    }

    fetchData();
  }, []);

  // Auto-select nearest item if within 100m
  useEffect(() => {
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
  }, [position, items]);

  // Filter update types: show global ones + ones specific to the selected item's type
  const selectedItem = items.find((i) => i.id === itemId);
  const availableUpdateTypes = updateTypes.filter(
    (t) => t.is_global || (selectedItem && t.item_type_id === selectedItem.item_type_id)
  );

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

    setError('');
    setSaving(true);

    try {
      const supabase = createClient();

      const { data: update, error: insertError } = await supabase
        .from('item_updates')
        .insert({
          item_id: itemId,
          update_type_id: updateTypeId,
          content: content || null,
          update_date: updateDate,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const path = `${itemId}/updates/${update.id}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('item-photos')
          .upload(path, file);

        if (!uploadError) {
          await supabase.from('photos').insert({
            item_id: itemId,
            update_id: update.id,
            storage_path: path,
          });
        }
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update.');
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className="label">
            Update Type *
          </label>
          <select
            id="type"
            value={updateTypeId}
            onChange={(e) => setUpdateTypeId(e.target.value)}
            className="input-field"
            required
          >
            <option value="">Select type...</option>
            {availableUpdateTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
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
        />
      </div>

      <div>
        <label className="label">Photos</label>
        <PhotoUploader onPhotosSelected={(files) => setPhotos((prev) => [...prev, ...files])} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Add Update'}
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
