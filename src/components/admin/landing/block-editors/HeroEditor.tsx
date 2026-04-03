'use client';

import { useState } from 'react';
import type { HeroBlock, LandingAsset } from '@/lib/config/landing-types';
import AssetPicker from '@/components/admin/landing/AssetPicker';

interface HeroEditorProps {
  orgId: string;
  block: HeroBlock;
  onChange: (block: HeroBlock) => void;
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
}

export default function HeroEditor({ orgId, block, onChange, assets, onAssetsChange }: HeroEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700">Subtitle</label>
        <input
          type="text"
          value={block.subtitle ?? ''}
          onChange={(e) => onChange({ ...block, subtitle: e.target.value || undefined })}
          className="mt-1 w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Background Image</label>
        {block.backgroundImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.backgroundImageUrl}
            alt="Background preview"
            className="w-full h-20 object-cover rounded mb-2"
          />
        )}
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
        >
          Choose Background Image
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={block.overlay ?? false}
          onChange={(e) => onChange({ ...block, overlay: e.target.checked })}
          className="rounded"
        />
        Dark overlay on image
      </label>

      {showPicker && (
        <AssetPicker
          orgId={orgId}
          assets={assets}
          onSelect={(url) => onChange({ ...block, backgroundImageUrl: url })}
          onUpload={(asset) => onAssetsChange([...assets, asset])}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
