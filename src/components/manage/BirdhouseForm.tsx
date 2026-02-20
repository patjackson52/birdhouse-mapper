'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { BirdhouseStatus } from '@/lib/types';
import PhotoUploader from './PhotoUploader';

const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading map...
    </div>
  ),
});

const SPECIES_OPTIONS = [
  'Black-capped Chickadee',
  'Violet-green Swallow',
  'Tree Swallow',
  "Bewick's Wren",
  'Chestnut-backed Chickadee',
  'Other',
];

export default function BirdhouseForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [speciesTarget, setSpeciesTarget] = useState('');
  const [status, setStatus] = useState<BirdhouseStatus>('planned');
  const [installedDate, setInstalledDate] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!latitude || !longitude) {
      setError('Please select a location on the map.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const supabase = createClient();

      // Insert birdhouse
      const { data: birdhouse, error: insertError } = await supabase
        .from('birdhouses')
        .insert({
          name,
          description: description || null,
          latitude,
          longitude,
          species_target: speciesTarget || null,
          status,
          installed_date: installedDate || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const path = `${birdhouse.id}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('birdhouse-photos')
          .upload(path, file);

        if (!uploadError) {
          await supabase.from('photos').insert({
            birdhouse_id: birdhouse.id,
            storage_path: path,
            is_primary: i === 0,
          });
        }
      }

      router.push('/manage');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save birdhouse.');
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
        <label htmlFor="name" className="label">
          Birdhouse Name *
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
          placeholder="Location details, mounting info, design notes..."
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="species" className="label">
            Target Species
          </label>
          <select
            id="species"
            value={speciesTarget}
            onChange={(e) => setSpeciesTarget(e.target.value)}
            className="input-field"
          >
            <option value="">Select species...</option>
            {SPECIES_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as BirdhouseStatus)}
            className="input-field"
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="damaged">Needs Repair</option>
            <option value="removed">Removed</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="date" className="label">
          Installation Date
        </label>
        <input
          id="date"
          type="date"
          value={installedDate}
          onChange={(e) => setInstalledDate(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      <div>
        <label className="label">Photos</label>
        <PhotoUploader onPhotosSelected={(files) => setPhotos((prev) => [...prev, ...files])} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Add Birdhouse'}
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
