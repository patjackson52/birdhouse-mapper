'use client';

import { useState, useRef, useCallback } from 'react';
import { resizeImage } from '@/lib/utils';
import { uploadImageAsset } from './actions';
import { useConfig } from '@/lib/config/client';
import { isGooglePhotosConfigured, getGooglePhotosPickerUrl } from '@/lib/google/picker';

type Tab = 'library' | 'upload' | 'google-photos' | 'url';

interface AssetItem {
  id: string;
  publicUrl: string;
  fileName: string;
}

interface ImagePickerFieldProps {
  value: string;
  onChange: (url: string) => void;
  fetchAssets: () => Promise<AssetItem[]>;
}

export function ImagePickerField({ value, onChange, fetchAssets }: ImagePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-1">
      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Selected"
            className="w-full h-24 object-cover rounded border border-gray-200 cursor-pointer"
            onClick={() => setIsOpen(true)}
          />
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="bg-white/90 rounded px-1.5 py-0.5 text-xs text-gray-700 hover:bg-white shadow-sm"
              aria-label="Change image"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="bg-white/90 rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-white shadow-sm"
              aria-label="Clear image"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full h-20 rounded border-2 border-dashed border-gray-300 hover:border-blue-400 flex items-center justify-center text-xs text-gray-500 hover:text-blue-600 transition-colors"
        >
          Choose Image
        </button>
      )}

      {isOpen && (
        <ImagePickerModal
          onSelect={(url) => { onChange(url); setIsOpen(false); }}
          onClose={() => setIsOpen(false)}
          fetchAssets={fetchAssets}
        />
      )}
    </div>
  );
}

function ImagePickerModal({
  onSelect,
  onClose,
  fetchAssets,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
  fetchAssets: () => Promise<AssetItem[]>;
}) {
  const config = useConfig();
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showGooglePhotos = isGooglePhotosConfigured();

  const loadAssets = useCallback(async () => {
    if (loaded) return;
    const items = await fetchAssets();
    setAssets(items);
    setLoaded(true);
  }, [fetchAssets, loaded]);

  if (activeTab === 'library' && !loaded) {
    loadAssets();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const blob = await resizeImage(file, 2000);
      const resized = new File([blob], file.name, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', resized);
      formData.append('category', 'image');
      const { asset, error } = await uploadImageAsset(formData);
      if (error || !asset) {
        setUploadError(error ?? 'Upload failed');
      } else {
        onSelect(asset.publicUrl);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleGooglePhotos() {
    setGoogleStatus('loading');

    const popup = window.open(getGooglePhotosPickerUrl(1, config.platformDomain), 'google-photos-picker', 'width=900,height=600,scrollbars=yes');
    if (!popup) {
      setGoogleStatus('error');
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'google-photos-picked') return;
      window.removeEventListener('message', handleMessage);

      const results = event.data.results || [];
      if (results.length === 0) {
        setGoogleStatus('idle');
        return;
      }

      try {
        const result = results[0];
        const response = await fetch('/api/photos/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url, token: result.token }),
        });
        if (!response.ok) throw new Error('Failed to download photo');

        const blob = await response.blob();
        const resized = await resizeImage(new File([blob], result.name, { type: result.mimeType }), 2000);
        const formData = new FormData();
        formData.append('file', new File([resized], result.name, { type: 'image/jpeg' }));
        formData.append('category', 'image');
        const { asset, error } = await uploadImageAsset(formData);
        if (error || !asset) throw new Error(error ?? 'Upload failed');
        onSelect(asset.publicUrl);
      } catch {
        setGoogleStatus('error');
      }
    };

    window.addEventListener('message', handleMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setGoogleStatus((s) => (s === 'loading' ? 'idle' : s));
      }
    }, 500);
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'library', label: 'Library', show: true },
    { id: 'upload', label: 'Upload', show: true },
    { id: 'google-photos', label: 'Google Photos', show: showGooglePhotos },
    { id: 'url', label: 'URL', show: true },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Select Image</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Close">&times;</button>
        </div>

        <div className="flex border-b border-gray-200 px-4">
          {tabs.filter(t => t.show).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs py-2 px-3 border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' && (
            assets.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No images uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset.publicUrl)}
                    className="group relative rounded overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                  >
                    <img src={asset.publicUrl} alt={asset.fileName} className="w-full h-20 object-cover" />
                    <div className="px-1 py-0.5 text-xs text-gray-600 truncate bg-white">{asset.fileName}</div>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {uploadError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 w-full">{uploadError}</div>}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-blue-600 border border-blue-300 rounded-lg px-6 py-3 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Choose Image File'}
              </button>
              <p className="text-xs text-gray-400">Image will be resized to max 2000px width.</p>
            </div>
          )}

          {activeTab === 'google-photos' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {googleStatus === 'idle' && (
                <button type="button" onClick={handleGooglePhotos} className="btn-primary">
                  Browse Google Photos
                </button>
              )}
              {googleStatus === 'loading' && <p className="text-sm text-gray-600">Connecting to Google Photos...</p>}
              {googleStatus === 'error' && (
                <div>
                  <p className="text-sm text-red-600 mb-2">Failed to import photo.</p>
                  <button type="button" onClick={handleGooglePhotos} className="btn-secondary text-sm">Try Again</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="flex flex-col gap-3 py-4">
              <label className="text-xs font-medium text-gray-700">Image URL</label>
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { onSelect(externalUrl.trim()); }}
                disabled={!externalUrl.trim()}
                className="self-start text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                Use URL
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
