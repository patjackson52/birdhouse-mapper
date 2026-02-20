'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Birdhouse, UpdateType } from '@/lib/types';
import { updateTypeLabels } from '@/lib/utils';
import PhotoUploader from './PhotoUploader';

const UPDATE_TYPES: UpdateType[] = [
  'installation',
  'observation',
  'maintenance',
  'damage',
  'sighting',
];

export default function UpdateForm() {
  const router = useRouter();
  const [birdhouses, setBirdhouses] = useState<Birdhouse[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [birdhouseId, setBirdhouseId] = useState('');
  const [updateType, setUpdateType] = useState<UpdateType>('observation');
  const [content, setContent] = useState('');
  const [updateDate, setUpdateDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [photos, setPhotos] = useState<File[]>([]);

  useEffect(() => {
    async function fetchBirdhouses() {
      const supabase = createClient();
      const { data } = await supabase
        .from('birdhouses')
        .select('*')
        .neq('status', 'removed')
        .order('name', { ascending: true });

      if (data) setBirdhouses(data);
    }

    fetchBirdhouses();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!birdhouseId) {
      setError('Please select a birdhouse.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const supabase = createClient();

      const { data: update, error: insertError } = await supabase
        .from('birdhouse_updates')
        .insert({
          birdhouse_id: birdhouseId,
          update_type: updateType,
          content: content || null,
          update_date: updateDate,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const path = `${birdhouseId}/updates/${update.id}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('birdhouse-photos')
          .upload(path, file);

        if (!uploadError) {
          await supabase.from('photos').insert({
            birdhouse_id: birdhouseId,
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
        <label htmlFor="birdhouse" className="label">
          Birdhouse *
        </label>
        <select
          id="birdhouse"
          value={birdhouseId}
          onChange={(e) => setBirdhouseId(e.target.value)}
          className="input-field"
          required
        >
          <option value="">Select a birdhouse...</option>
          {birdhouses.map((bh) => (
            <option key={bh.id} value={bh.id}>
              {bh.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className="label">
            Update Type *
          </label>
          <select
            id="type"
            value={updateType}
            onChange={(e) => setUpdateType(e.target.value as UpdateType)}
            className="input-field"
          >
            {UPDATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {updateTypeLabels[t]}
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
