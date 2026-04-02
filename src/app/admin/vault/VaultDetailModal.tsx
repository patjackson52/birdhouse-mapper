'use client';

import { useState, useEffect } from 'react';
import type { VaultItem } from '@/lib/vault/types';
import { updateVaultItem, deleteFromVault, setPropertyExclusion } from '@/lib/vault/actions';
import { getVaultUrl } from '@/lib/vault/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isImageMime(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VaultDetailModalProps {
  item: VaultItem;
  properties: { id: string; name: string }[];
  exclusions: Set<string>; // property IDs excluded from this item
  onClose: () => void;
  onUpdated: (updated: Partial<VaultItem>) => void;
  onDeleted: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VaultDetailModal({
  item,
  properties,
  exclusions,
  onClose,
  onUpdated,
  onDeleted,
}: VaultDetailModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState(item.is_ai_context);
  const [aiToggling, setAiToggling] = useState(false);
  const [localExclusions, setLocalExclusions] = useState<Set<string>>(new Set(exclusions));
  const [exclusionLoading, setExclusionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve image URL (may be async for private items)
  useEffect(() => {
    if (!isImageMime(item.mime_type)) return;
    const result = getVaultUrl(item);
    if (typeof result === 'string') {
      setImageUrl(result);
    } else {
      result.then(setImageUrl).catch(() => setImageUrl(null));
    }
  }, [item]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleAiToggle() {
    setAiToggling(true);
    setError(null);
    const next = !aiContext;
    const result = await updateVaultItem(item.id, { is_ai_context: next });
    if ('error' in result) {
      setError(result.error);
    } else {
      setAiContext(next);
      onUpdated({ is_ai_context: next });
    }
    setAiToggling(false);
  }

  async function handlePropertyToggle(propertyId: string, currentlyExcluded: boolean) {
    setExclusionLoading(propertyId);
    setError(null);
    // checked = available (not excluded), unchecked = excluded
    const shouldExclude = !currentlyExcluded;
    const result = await setPropertyExclusion(item.id, propertyId, shouldExclude);
    if ('error' in result) {
      setError(result.error);
    } else {
      setLocalExclusions((prev) => {
        const next = new Set(prev);
        if (shouldExclude) {
          next.add(propertyId);
        } else {
          next.delete(propertyId);
        }
        return next;
      });
    }
    setExclusionLoading(null);
  }

  async function handleDownload() {
    const result = getVaultUrl(item);
    const url = typeof result === 'string' ? result : await result;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.file_name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteFromVault(item.id);
    if ('error' in result) {
      setError(result.error);
      setDeleting(false);
    } else {
      onDeleted(item.id);
      onClose();
    }
  }

  const uploadDate = new Date(item.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-forest-dark truncate pr-4" title={item.file_name}>
            {item.file_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sage hover:text-forest-dark text-xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Error banner */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Image preview */}
          {isImageMime(item.mime_type) && (
            <div className="w-full aspect-video bg-sage-light rounded-lg overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={item.file_name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-sage text-sm">Loading preview…</span>
              )}
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="label text-xs mb-0.5">Category</div>
              <div className="text-forest-dark capitalize">{item.category}</div>
            </div>
            <div>
              <div className="label text-xs mb-0.5">Size</div>
              <div className="text-forest-dark">{formatBytes(item.file_size)}</div>
            </div>
            <div>
              <div className="label text-xs mb-0.5">Visibility</div>
              <div className="text-forest-dark capitalize">{item.visibility}</div>
            </div>
            <div>
              <div className="label text-xs mb-0.5">Uploaded</div>
              <div className="text-forest-dark">{uploadDate}</div>
            </div>
          </div>

          {/* AI context toggle */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <div className="text-sm font-medium text-forest-dark">AI Context</div>
              <div className="text-xs text-sage">Include this file as context for AI features</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiContext}
              disabled={aiToggling}
              onClick={handleAiToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-forest disabled:opacity-50 ${
                aiContext ? 'bg-forest' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  aiContext ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Property scoping */}
          {properties.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-sm font-medium text-forest-dark mb-1">Property Availability</div>
              <div className="text-xs text-sage mb-3">
                Checked properties have access to this file.
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {properties.map((prop) => {
                  const isExcluded = localExclusions.has(prop.id);
                  const isAvailable = !isExcluded;
                  const isLoading = exclusionLoading === prop.id;
                  return (
                    <label
                      key={prop.id}
                      className="flex items-center gap-2.5 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={isAvailable}
                        disabled={isLoading}
                        onChange={() => handlePropertyToggle(prop.id, isExcluded)}
                        className="h-4 w-4 rounded border-gray-300 text-forest focus:ring-forest disabled:opacity-50 cursor-pointer"
                      />
                      <span className="text-sm text-forest-dark group-hover:text-forest transition-colors">
                        {prop.name}
                      </span>
                      {isLoading && (
                        <span className="text-xs text-sage ml-auto">Saving…</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-100">
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-red-700 font-medium">
                Are you sure you want to permanently delete this file?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="btn-secondary text-sm flex-1"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded-lg px-4 py-2 font-medium transition-colors flex-1"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
