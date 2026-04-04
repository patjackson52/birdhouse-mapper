'use client';

import { useState } from 'react';
import { resizeImage } from '@/lib/utils';
import PhotoSourcePicker from '@/components/photos/PhotoSourcePicker';
import VaultPicker from '@/components/vault/VaultPicker';
import { getVaultUrl } from '@/lib/vault/helpers';
import type { VaultItem } from '@/lib/vault/types';

interface PhotoUploaderProps {
  onPhotosSelected: (files: File[]) => void;
  maxFiles?: number;
  orgId?: string;
}

export default function PhotoUploader({
  onPhotosSelected,
  maxFiles = 5,
  orgId,
}: PhotoUploaderProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [loadingVault, setLoadingVault] = useState(false);

  async function handleFilesSelected(files: File[]) {
    if (files.length === 0) return;

    const limited = files.slice(0, maxFiles - previews.length);

    // Create previews
    const newPreviews = limited.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);

    // Resize files
    const resized: File[] = [];
    for (const file of limited) {
      try {
        const blob = await resizeImage(file, 1200);
        resized.push(
          new File([blob], file.name, { type: 'image/jpeg' })
        );
      } catch {
        resized.push(file);
      }
    }

    onPhotosSelected(resized);
  }

  async function handleVaultSelect(items: VaultItem[]) {
    setShowVaultPicker(false);
    if (items.length === 0) return;

    const limited = items.slice(0, maxFiles - previews.length);
    setLoadingVault(true);

    try {
      const files: File[] = [];
      const newPreviews: string[] = [];

      for (const item of limited) {
        const url = await getVaultUrl(item);
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], item.file_name, {
          type: item.mime_type ?? 'image/jpeg',
        });
        files.push(file);
        newPreviews.push(url);
      }

      setPreviews((prev) => [...prev, ...newPreviews]);
      onPhotosSelected(files);
    } catch (err) {
      console.error('Failed to load vault photo:', err);
    } finally {
      setLoadingVault(false);
    }
  }

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const canAddMore = previews.length < maxFiles;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {previews.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-sage-light">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePreview(i)}
              className="absolute top-0.5 right-0.5 w-8 h-8 min-w-[44px] min-h-[44px] bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {canAddMore && (
        <div className="flex flex-col gap-2">
          {orgId && (
            <button
              type="button"
              disabled={loadingVault}
              onClick={() => setShowVaultPicker(true)}
              className="btn-primary"
            >
              {loadingVault ? 'Loading...' : 'Select from Vault'}
            </button>
          )}
          <PhotoSourcePicker
            accept="image/*"
            maxFiles={maxFiles - previews.length}
            maxWidth={1200}
            onFilesSelected={handleFilesSelected}
          />
        </div>
      )}

      {showVaultPicker && orgId && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          multiple={maxFiles - previews.length > 1}
          onSelect={handleVaultSelect}
          onClose={() => setShowVaultPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}
    </div>
  );
}
