'use client';

import { useRef, useState } from 'react';
import { resizeImage } from '@/lib/utils';
import { uploadLandingAsset } from '@/app/admin/landing/actions';
import type { LandingAsset } from '@/lib/config/landing-types';

type Tab = 'uploaded' | 'upload' | 'external';

interface AssetPickerProps {
  assets: LandingAsset[];
  onSelect: (url: string) => void;
  onUpload: (asset: LandingAsset) => void;
  onClose: () => void;
}

export default function AssetPicker({ assets, onSelect, onUpload, onClose }: AssetPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('uploaded');
  const [externalUrl, setExternalUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageAssets = assets.filter(a => a.category === 'image');

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const blob = await resizeImage(file, 1600);
      const resized = new File([blob], file.name, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', resized);
      formData.append('category', 'image');
      const { asset, error } = await uploadLandingAsset(formData);
      if (error || !asset) {
        setUploadError(error ?? 'Upload failed');
      } else {
        onUpload(asset);
        onSelect(asset.publicUrl);
        onClose();
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleUseExternalUrl() {
    const url = externalUrl.trim();
    if (!url) return;
    onSelect(url);
    onClose();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'uploaded', label: 'Uploaded Assets' },
    { id: 'upload', label: 'Upload New' },
    { id: 'external', label: 'External URL' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Select Image</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs py-2 px-3 border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'uploaded' && (
            <>
              {imageAssets.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No images uploaded yet. Use the &quot;Upload New&quot; tab.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {imageAssets.map(asset => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => { onSelect(asset.publicUrl); onClose(); }}
                      className="group relative rounded overflow-hidden border border-gray-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.publicUrl}
                        alt={asset.description || asset.fileName}
                        className="w-full h-20 object-cover group-hover:opacity-90 transition-opacity"
                      />
                      <div className="px-1 py-0.5 text-xs text-gray-600 truncate bg-white">{asset.fileName}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {uploadError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 w-full">
                  {uploadError}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-500 rounded-lg px-6 py-3 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                {uploading ? 'Uploading…' : 'Choose Image File'}
              </button>
              <p className="text-xs text-gray-400">Image will be resized to max 1600px width.</p>
            </div>
          )}

          {activeTab === 'external' && (
            <div className="flex flex-col gap-3 py-4">
              <label className="text-xs font-medium text-gray-700">Image URL</label>
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={externalUrl}
                onChange={e => setExternalUrl(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
              <button
                type="button"
                onClick={handleUseExternalUrl}
                disabled={!externalUrl.trim()}
                className="self-start text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                Use URL
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
