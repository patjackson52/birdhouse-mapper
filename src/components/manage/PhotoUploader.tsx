'use client';

import { useState, useRef } from 'react';
import { resizeImage } from '@/lib/utils';

interface PhotoUploaderProps {
  onPhotosSelected: (files: File[]) => void;
  maxFiles?: number;
}

export default function PhotoUploader({
  onPhotosSelected,
  maxFiles = 5,
}: PhotoUploaderProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
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

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {previews.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-sage-light">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePreview(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {previews.length < maxFiles && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary text-sm"
          >
            {previews.length === 0 ? 'Add Photos' : 'Add More Photos'}
          </button>
          <p className="text-xs text-sage mt-1">
            Up to {maxFiles} photos. Images will be resized automatically.
          </p>
        </div>
      )}
    </div>
  );
}
