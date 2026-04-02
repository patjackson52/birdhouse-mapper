'use client';

import { useState, useRef } from 'react';
import { uploadLogo, uploadDefaultLogo } from '@/app/admin/settings/logo-actions';
import VaultPicker from '@/components/vault/VaultPicker';
import type { VaultItem } from '@/lib/vault/types';
import { getVaultUrl } from '@/lib/vault/helpers';

const DEFAULT_LOGOS = [
  { name: 'fieldmapper', label: 'FieldMapper', src: '/defaults/logos/fieldmapper.png' },
  { name: 'birdhouse', label: 'Birdhouse', src: '/defaults/logos/birdhouse.png' },
  { name: 'binoculars', label: 'Binoculars', src: '/defaults/logos/binoculars.png' },
  { name: 'leaf', label: 'Leaf', src: '/defaults/logos/leaf.png' },
];

interface LogoUploaderProps {
  currentLogoUrl: string | null;
  scope: 'org' | 'property';
  propertyId?: string;
  orgId: string;
  onUploaded: (basePath: string) => void;
}

export default function LogoUploader({ currentLogoUrl, scope, propertyId, orgId, onUploaded }: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set('logo', file);

    try {
      const result = await uploadLogo(formData, scope, propertyId);
      if (result.error) {
        setError(result.error);
      } else if (result.basePath) {
        onUploaded(result.basePath);
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDefaultSelect(defaultName: string) {
    setUploading(true);
    setError(null);

    try {
      const result = await uploadDefaultLogo(defaultName, scope, propertyId);
      if (result.error) {
        setError(result.error);
      } else if (result.basePath) {
        onUploaded(result.basePath);
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleVaultSelect(items: VaultItem[]) {
    const item = items[0];
    if (!item) return;
    setShowVaultPicker(false);
    // Use the vault item's storage_path as the basePath (minus the filename)
    // storage_path is orgId/itemId/filename — we store it as the logo URL directly
    const url = getVaultUrl(item);
    if (typeof url === 'string') {
      onUploaded(url);
    } else {
      url.then(onUploaded).catch(() => setError('Failed to get vault item URL.'));
    }
  }

  return (
    <div className="space-y-4">
      {currentLogoUrl && (
        <div className="flex items-center gap-3">
          <img
            src={currentLogoUrl}
            alt="Current logo"
            className="h-16 w-16 object-contain rounded border border-sage-light"
          />
          <span className="text-sm text-sage">Current logo</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-sm"
          >
            {uploading ? 'Uploading...' : 'Upload Custom Logo'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowVaultPicker(true)}
          disabled={uploading}
          className="btn-secondary text-sm"
        >
          Select from Vault
        </button>
      </div>

      <p className="text-xs text-sage">
        PNG, JPG, or SVG. Max 5MB. Will be resized for PWA icons and favicon.
      </p>

      <div>
        <p className="text-sm font-medium text-forest-dark mb-2">Or choose a default:</p>
        <div className="flex gap-3">
          {DEFAULT_LOGOS.map((logo) => (
            <button
              key={logo.name}
              type="button"
              onClick={() => handleDefaultSelect(logo.name)}
              disabled={uploading}
              className="flex flex-col items-center gap-1 p-2 rounded-lg border border-sage-light hover:border-forest transition-colors disabled:opacity-50"
            >
              <img src={logo.src} alt={logo.label} className="h-12 w-12 object-contain" />
              <span className="text-xs text-sage">{logo.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}

      {showVaultPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['branding']}
          visibilityFilter="public"
          multiple={false}
          defaultUploadCategory="branding"
          defaultUploadVisibility="public"
          onSelect={handleVaultSelect}
          onClose={() => setShowVaultPicker(false)}
        />
      )}
    </div>
  );
}
