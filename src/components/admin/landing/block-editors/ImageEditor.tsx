'use client';

import { useState } from 'react';
import type { ImageBlock, LandingAsset } from '@/lib/config/landing-types';
import AssetPicker from '@/components/admin/landing/AssetPicker';

interface ImageEditorProps {
  block: ImageBlock;
  onChange: (block: ImageBlock) => void;
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
}

export default function ImageEditor({ block, onChange, assets, onAssetsChange }: ImageEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Image</label>
        {block.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.url}
            alt={block.alt || 'Preview'}
            className="w-full h-24 object-cover rounded mb-2"
          />
        )}
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
        >
          Choose Image
        </button>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Alt Text</label>
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onChange({ ...block, alt: e.target.value })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Caption</label>
        <input
          type="text"
          value={block.caption ?? ''}
          onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Width</label>
        <select
          value={block.width ?? 'medium'}
          onChange={(e) => onChange({ ...block, width: e.target.value as 'small' | 'medium' | 'full' })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="full">Full width</option>
        </select>
      </div>

      {showPicker && (
        <AssetPicker
          assets={assets}
          onSelect={(url) => onChange({ ...block, url })}
          onUpload={(asset) => onAssetsChange([...assets, asset])}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
