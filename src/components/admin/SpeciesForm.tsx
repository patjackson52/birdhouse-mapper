'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';
import { resizeImage } from '@/lib/utils';

interface SpeciesFormProps {
  species?: Species;
  onSaved: (species: Species) => void;
  onCancel: () => void;
}

export default function SpeciesForm({ species, onSaved, onCancel }: SpeciesFormProps) {
  const [name, setName] = useState(species?.name || '');
  const [scientificName, setScientificName] = useState(species?.scientific_name || '');
  const [description, setDescription] = useState(species?.description || '');
  const [conservationStatus, setConservationStatus] = useState(species?.conservation_status || '');
  const [category, setCategory] = useState(species?.category || '');
  const [externalLink, setExternalLink] = useState(species?.external_link || '');
  const [sortOrder, setSortOrder] = useState(species?.sort_order ?? 0);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(() => {
    if (!species?.photo_path) return null;
    const supabase = createClient();
    const { data } = supabase.storage.from('item-photos').getPublicUrl(species.photo_path);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      let photoPath = species?.photo_path || null;

      // If photo was removed (no new file, no existing URL, but had a path)
      if (!photoFile && !existingPhotoUrl && species?.photo_path) {
        photoPath = null;
      }

      const payload = {
        name: name.trim(),
        scientific_name: scientificName.trim() || null,
        description: description.trim() || null,
        conservation_status: conservationStatus.trim() || null,
        category: category.trim() || null,
        external_link: externalLink.trim() || null,
        sort_order: sortOrder,
        photo_path: photoPath,
      };

      if (species) {
        // Update — upload photo to the correct path directly
        if (photoFile) {
          const path = `species/${species.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          payload.photo_path = path;
        }

        const { data, error: err } = await supabase
          .from('species')
          .update(payload)
          .eq('id', species.id)
          .select()
          .single();
        if (err) throw err;
        onSaved(data);
      } else {
        // Insert — create the record first, then upload photo with real id
        const { data, error: err } = await supabase
          .from('species')
          .insert({ ...payload, photo_path: null })
          .select()
          .single();
        if (err) throw err;

        if (photoFile) {
          const path = `species/${data.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          await supabase.from('species').update({ photo_path: path }).eq('id', data.id);
          data.photo_path = path;
        }

        onSaved(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save species.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">
        {species ? 'Edit Species' : 'Add Species'}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Common Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="label">Scientific Name</label>
          <input type="text" value={scientificName} onChange={(e) => setScientificName(e.target.value)} className="input-field" placeholder="e.g., Poecile atricapillus" />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field min-h-[80px]" placeholder="Habitat, behavior notes..." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" placeholder="e.g., Songbirds" />
        </div>
        <div>
          <label className="label">Conservation Status</label>
          <input type="text" value={conservationStatus} onChange={(e) => setConservationStatus(e.target.value)} className="input-field" placeholder="e.g., Least Concern" />
        </div>
      </div>

      <div>
        <label className="label">External Link</label>
        <input type="url" value={externalLink} onChange={(e) => setExternalLink(e.target.value)} className="input-field" placeholder="https://..." />
      </div>

      <div>
        <label className="label">Sort Order</label>
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="input-field w-24" />
      </div>

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
          {saving ? 'Saving...' : species ? 'Update Species' : 'Add Species'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}
