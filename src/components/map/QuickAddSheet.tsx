'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ItemStatus, ItemType } from '@/lib/types';
import { iconDisplayName } from '@/lib/types';
import { useUserLocation } from '@/lib/location/provider';
import BottomSheet from '@/components/ui/BottomSheet';

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  defaultLocation?: { lat: number; lng: number };
}

export default function QuickAddSheet({ open, onClose, defaultLocation }: QuickAddSheetProps) {
  const { position, startTracking } = useUserLocation();
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [name, setName] = useState('');
  const [status] = useState<ItemStatus>('planned');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const location = defaultLocation ?? (position ? { lat: position.lat, lng: position.lng } : null);

  useEffect(() => {
    if (!open) return;
    async function fetchTypes() {
      const supabase = createClient();
      const { data } = await supabase
        .from('item_types')
        .select('*')
        .order('sort_order', { ascending: true });
      if (data) {
        setItemTypes(data);
        if (data.length === 1) setSelectedTypeId(data[0].id);
      }
    }
    fetchTypes();
    startTracking();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a name.');
      return;
    }
    if (!selectedTypeId) {
      setError('Please select a type.');
      return;
    }
    if (!location) {
      setError('Location not available. Enable GPS and try again.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const supabase = createClient();

      const { data: item, error: insertError } = await supabase
        .from('items')
        .insert({
          name: name.trim(),
          latitude: location.lat,
          longitude: location.lng,
          item_type_id: selectedTypeId,
          custom_field_values: {},
          status,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (photo) {
        const path = `${item.id}/${Date.now()}_0.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('vault-public')
          .upload(path, photo);
        if (!uploadError) {
          await supabase.from('photos').insert({
            item_id: item.id,
            storage_path: path,
            is_primary: true,
          });
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setName('');
        setSelectedTypeId(itemTypes.length === 1 ? itemTypes[0].id : '');
        setPhoto(null);
        setPhotoPreview(null);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose}>
      <div className="pb-4">
        <h2 className="text-lg font-semibold text-forest-dark mb-4">Quick Add Item</h2>

        {success ? (
          <div className="flex flex-col items-center py-8 gap-2 text-forest">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="font-medium">Item added!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* GPS location indicator */}
            <div className="flex items-center gap-2 text-sm">
              <svg className={`w-4 h-4 shrink-0 ${location ? 'text-forest' : 'text-sage'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
              <span className={location ? 'text-forest' : 'text-sage'}>
                {location
                  ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                  : 'Waiting for GPS…'}
              </span>
            </div>

            {/* Type selector */}
            {itemTypes.length > 1 && (
              <div>
                <label className="label">Type *</label>
                <select
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select type…</option>
                  {itemTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {iconDisplayName(t.icon)} {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="e.g., Box #12"
                enterKeyHint="done"
                required
              />
            </div>

            {/* Camera */}
            <div>
              <label className="label">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoPreview ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-sage-light">
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                    className="absolute top-0.5 right-0.5 w-8 h-8 min-w-[44px] min-h-[44px] bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-sm"
                >
                  Take Photo
                </button>
              )}
            </div>

            <button type="submit" disabled={saving || !location} className="btn-primary w-full">
              {saving ? 'Saving…' : 'Add Item'}
            </button>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
