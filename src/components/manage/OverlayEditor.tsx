'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useConfig, useTheme } from '@/lib/config/client';

interface OverlayConfig {
  url: string;
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  rotation: number;
  opacity: number;
}

interface OverlayEditorProps {
  initialConfig: OverlayConfig | null;
  onSave: (config: OverlayConfig | null) => void;
  saving: boolean;
}

const OverlayMap = dynamic(() => import('./OverlayMap'), {
  ssr: false,
  loading: () => (
    <div className="h-96 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading map...
    </div>
  ),
});

type PlacementStep = 'idle' | 'sw' | 'ne' | 'done';

export default function OverlayEditor({ initialConfig, onSave, saving }: OverlayEditorProps) {
  const [imageUrl, setImageUrl] = useState(initialConfig?.url || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(initialConfig?.url || '');
  const [opacity, setOpacity] = useState(initialConfig?.opacity ?? 0.5);
  const [sw, setSw] = useState(initialConfig?.bounds.southWest || null);
  const [ne, setNe] = useState(initialConfig?.bounds.northEast || null);
  const [placementStep, setPlacementStep] = useState<PlacementStep>(
    initialConfig ? 'done' : 'idle'
  );

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setImageUrl(''); // Clear URL input when file is uploaded
    }
  }

  function handleUrlChange(url: string) {
    setImageUrl(url);
    setImagePreview(url);
    setImageFile(null);
  }

  function startPlacement() {
    setSw(null);
    setNe(null);
    setPlacementStep('sw');
  }

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (placementStep === 'sw') {
      setSw({ lat, lng });
      setPlacementStep('ne');
    } else if (placementStep === 'ne') {
      setNe({ lat, lng });
      setPlacementStep('done');
    }
  }, [placementStep]);

  function handleSave() {
    if (!imagePreview || !sw || !ne) return;

    // For file uploads, we'd need to upload to Supabase storage first.
    // For now, use the URL directly (works for URL input; file uploads
    // would need a storage upload step in production).
    const finalUrl = imageUrl || imagePreview;

    onSave({
      url: finalUrl,
      bounds: {
        southWest: sw,
        northEast: ne,
      },
      rotation: 0,
      opacity,
    });
  }

  function handleRemove() {
    onSave(null);
    setImageUrl('');
    setImagePreview('');
    setImageFile(null);
    setSw(null);
    setNe(null);
    setPlacementStep('idle');
  }

  const hasImage = !!imagePreview;
  const hasPlacement = sw !== null && ne !== null;

  return (
    <div className="space-y-6">
      {/* Step 1: Image source */}
      <div>
        <h3 className="text-sm font-medium text-forest-dark mb-3">Map Overlay Image</h3>

        <div className="space-y-3">
          {/* File upload */}
          <div>
            <label className="block text-xs text-sage mb-1">Upload an image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="block w-full text-sm text-sage file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sage-light file:text-forest-dark hover:file:bg-sage-light/70 file:cursor-pointer"
            />
          </div>

          <div className="text-center text-xs text-sage">or</div>

          {/* URL input */}
          <div>
            <label htmlFor="overlay-url" className="block text-xs text-sage mb-1">Paste an image URL</label>
            <input
              id="overlay-url"
              type="url"
              value={imageUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="input-field"
              placeholder="https://example.com/map-image.png"
            />
          </div>
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="mt-3 rounded-lg border border-sage-light overflow-hidden">
            <img
              src={imagePreview}
              alt="Overlay preview"
              className="max-h-48 w-full object-contain bg-gray-50"
            />
          </div>
        )}
      </div>

      {/* Step 2: Place corners on map */}
      {hasImage && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-forest-dark">
              Position Overlay
            </h3>
            <button
              type="button"
              onClick={startPlacement}
              className="text-sm text-forest hover:text-forest-dark transition-colors"
            >
              {hasPlacement ? 'Reposition' : 'Place Corners'}
            </button>
          </div>

          {placementStep !== 'idle' && placementStep !== 'done' && (
            <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
              {placementStep === 'sw'
                ? '📍 Click the map to place the southwest (bottom-left) corner'
                : '📍 Click the map to place the northeast (top-right) corner'}
            </div>
          )}

          <div className="rounded-lg overflow-hidden border border-sage-light">
            <OverlayMap
              imageUrl={hasPlacement ? imagePreview : undefined}
              sw={sw}
              ne={ne}
              opacity={opacity}
              onMapClick={placementStep === 'sw' || placementStep === 'ne' ? handleMapClick : undefined}
            />
          </div>
        </div>
      )}

      {/* Step 3: Opacity slider */}
      {hasImage && hasPlacement && (
        <div>
          <label className="text-sm font-medium text-forest-dark mb-2 block">
            Overlay Opacity: {Math.round(opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-sage mt-1">
            <span>Transparent</span>
            <span>Opaque</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {hasImage && hasPlacement && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Overlay'}
          </button>
        )}
        {initialConfig && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="text-sm text-red-600 hover:text-red-800 transition-colors px-3 py-2"
          >
            Remove Overlay
          </button>
        )}
      </div>
    </div>
  );
}
