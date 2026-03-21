'use client';

import { useRef, useState } from 'react';
import { resizeImage } from '@/lib/utils';
import { uploadLandingAsset, deleteLandingAsset } from '@/app/admin/landing/actions';
import type { LandingAsset } from '@/lib/config/landing-types';

const MAX_ASSETS = 20;

interface AssetManagerProps {
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
  referenceLinks: { label: string; url: string }[];
  onReferenceLinksChange: (links: { label: string; url: string }[]) => void;
}

export default function AssetManager({
  assets,
  onAssetsChange,
  referenceLinks,
  onReferenceLinksChange,
}: AssetManagerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const imageAssets = assets.filter(a => a.category === 'image');
  const docAssets = assets.filter(a => a.category === 'document');
  const atLimit = assets.length >= MAX_ASSETS;

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingImage(true);
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
        onAssetsChange([...assets, asset]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function handleDocSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'document');
      const { asset, error } = await uploadLandingAsset(formData);
      if (error || !asset) {
        setUploadError(error ?? 'Upload failed');
      } else {
        onAssetsChange([...assets, asset]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  }

  async function handleDeleteAsset(asset: LandingAsset) {
    const { error } = await deleteLandingAsset(asset.storagePath);
    if (error) {
      setUploadError(error);
      return;
    }
    onAssetsChange(assets.filter(a => a.id !== asset.id));
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    onReferenceLinksChange([...referenceLinks, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowAddLink(false);
  }

  function handleDeleteLink(index: number) {
    onReferenceLinksChange(referenceLinks.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      {uploadError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {uploadError}
        </div>
      )}

      {/* Images section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Images</h4>
        {imageAssets.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {imageAssets.map(asset => (
              <div key={asset.id} className="relative group bg-gray-50 border border-gray-200 rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.publicUrl}
                  alt={asset.description || asset.fileName}
                  className="w-full h-16 object-cover"
                />
                <div className="px-1 py-0.5 text-xs text-gray-600 truncate">{asset.fileName}</div>
                <button
                  type="button"
                  onClick={() => handleDeleteAsset(asset)}
                  className="absolute top-1 right-1 bg-white border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-600 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  aria-label="Delete image"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        {imageAssets.length === 0 && (
          <p className="text-xs text-gray-400 mb-2">No images uploaded yet.</p>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        {!atLimit && (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadingImage}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white disabled:opacity-50"
          >
            {uploadingImage ? 'Uploading…' : '+ Add image'}
          </button>
        )}
        {atLimit && <p className="text-xs text-gray-400">Asset limit reached (max {MAX_ASSETS}).</p>}
      </div>

      {/* Documents section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Documents</h4>
        {docAssets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {docAssets.map(asset => (
              <div key={asset.id} className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700">
                <span className="truncate max-w-[140px]">{asset.fileName}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteAsset(asset)}
                  className="text-gray-400 hover:text-red-600 ml-0.5 leading-none"
                  aria-label="Delete document"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        {docAssets.length === 0 && (
          <p className="text-xs text-gray-400 mb-2">No documents uploaded yet.</p>
        )}
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleDocSelect}
        />
        {!atLimit && (
          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            disabled={uploadingDoc}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white disabled:opacity-50"
          >
            {uploadingDoc ? 'Uploading…' : '+ Add document'}
          </button>
        )}
        {atLimit && <p className="text-xs text-gray-400">Asset limit reached (max {MAX_ASSETS}).</p>}
      </div>

      {/* Reference links section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reference Links</h4>
        {referenceLinks.length > 0 && (
          <ul className="space-y-1 mb-2">
            {referenceLinks.map((link, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-medium truncate max-w-[100px]">{link.label}</span>
                <span className="text-gray-400">—</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[160px]">{link.url}</a>
                <button
                  type="button"
                  onClick={() => handleDeleteLink(i)}
                  className="ml-auto text-gray-400 hover:text-red-600"
                  aria-label="Delete link"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
        {referenceLinks.length === 0 && !showAddLink && (
          <p className="text-xs text-gray-400 mb-2">No reference links added yet.</p>
        )}
        {showAddLink ? (
          <form onSubmit={handleAddLink} className="flex flex-col gap-1.5 bg-gray-50 border border-gray-200 rounded p-2">
            <input
              type="text"
              placeholder="Label (e.g. Project Site)"
              value={newLinkLabel}
              onChange={e => setNewLinkLabel(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              required
            />
            <input
              type="url"
              placeholder="https://..."
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
              required
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700"
              >
                Add link
              </button>
              <button
                type="button"
                onClick={() => { setShowAddLink(false); setNewLinkLabel(''); setNewLinkUrl(''); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddLink(true)}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white"
          >
            + Add link
          </button>
        )}
      </div>
    </div>
  );
}
