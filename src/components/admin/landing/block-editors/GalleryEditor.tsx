'use client';

import { useState } from 'react';
import type { GalleryBlock, LandingAsset } from '@/lib/config/landing-types';
import AssetPicker from '@/components/admin/landing/AssetPicker';

interface GalleryEditorProps {
  orgId: string;
  block: GalleryBlock;
  onChange: (block: GalleryBlock) => void;
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
}

export default function GalleryEditor({ orgId, block, onChange, assets, onAssetsChange }: GalleryEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  function removeImage(index: number) {
    onChange({ ...block, images: block.images.filter((_, i) => i !== index) });
  }

  function updateCaption(index: number, caption: string) {
    const updated = block.images.map((img, i) =>
      i === index ? { ...img, caption: caption || undefined } : img
    );
    onChange({ ...block, images: updated });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700">Columns</label>
        <select
          value={block.columns ?? 3}
          onChange={(e) => onChange({ ...block, columns: Number(e.target.value) as 2 | 3 | 4 })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value={2}>2 columns</option>
          <option value={3}>3 columns</option>
          <option value={4}>4 columns</option>
        </select>
      </div>

      {block.images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {block.images.map((img, i) => (
            <div key={i} className="relative group bg-gray-50 border border-gray-200 rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || 'Gallery image'}
                className="w-full h-16 object-cover"
              />
              <input
                type="text"
                value={img.caption ?? ''}
                onChange={(e) => updateCaption(i, e.target.value)}
                placeholder="Caption"
                className="w-full text-xs px-1 py-0.5 border-t border-gray-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-white border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                aria-label="Remove image"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
      >
        + Add Image
      </button>

      {showPicker && (
        <AssetPicker
          orgId={orgId}
          assets={assets}
          onSelect={(url) => {
            onChange({ ...block, images: [...block.images, { url, alt: '', caption: undefined }] });
          }}
          onUpload={(asset) => onAssetsChange([...assets, asset])}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
