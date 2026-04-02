'use client';

import { useState } from 'react';
import VaultPicker from '@/components/vault/VaultPicker';
import type { LandingAsset } from '@/lib/config/landing-types';
import type { VaultItem } from '@/lib/vault/types';
import { createClient } from '@/lib/supabase/client';

type Tab = 'vault' | 'external';

interface AssetPickerProps {
  orgId: string;
  assets: LandingAsset[];
  onSelect: (url: string) => void;
  onUpload: (asset: LandingAsset) => void;
  onClose: () => void;
}

function vaultItemToLandingAsset(item: VaultItem): { asset: LandingAsset; publicUrl: string } {
  const supabase = createClient();
  const { data: { publicUrl } } = supabase.storage
    .from(item.storage_bucket)
    .getPublicUrl(item.storage_path);

  const asset: LandingAsset = {
    id: item.id,
    storagePath: item.id,
    publicUrl,
    fileName: item.file_name,
    mimeType: item.mime_type ?? '',
    category: item.category === 'photo' ? 'image' : 'document',
    description: '',
    uploadedAt: item.created_at,
  };
  return { asset, publicUrl };
}

export default function AssetPicker({ orgId, assets, onSelect, onUpload, onClose }: AssetPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('vault');
  const [externalUrl, setExternalUrl] = useState('');
  const [showVaultPicker, setShowVaultPicker] = useState(false);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleVaultSelect(items: VaultItem[]) {
    if (items.length === 0) return;
    const item = items[0];
    const { asset, publicUrl } = vaultItemToLandingAsset(item);
    onUpload(asset);
    onSelect(publicUrl);
    onClose();
  }

  function handleUseExternalUrl() {
    const url = externalUrl.trim();
    if (!url) return;
    onSelect(url);
    onClose();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vault', label: 'Data Vault' },
    { id: 'external', label: 'External URL' },
  ];

  return (
    <>
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
            {activeTab === 'vault' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <p className="text-xs text-gray-500 text-center">
                  Select an image from your Data Vault, or upload a new one.
                </p>
                <button
                  type="button"
                  onClick={() => setShowVaultPicker(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-500 rounded-lg px-6 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Browse Data Vault
                </button>
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

      {showVaultPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          visibilityFilter="public"
          multiple={false}
          onSelect={handleVaultSelect}
          onClose={() => setShowVaultPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}
    </>
  );
}
