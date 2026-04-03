'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadToVault } from '@/lib/vault/actions';
import type { VaultCategory, VaultVisibility, VaultItem } from '@/lib/vault/types';

interface VaultUploadTabProps {
  orgId: string;
  defaultCategory?: VaultCategory;
  defaultVisibility?: VaultVisibility;
  defaultIsAiContext?: boolean;
  onUploaded: (item: VaultItem) => void;
}

const CATEGORY_OPTIONS: { value: VaultCategory; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'document', label: 'Document' },
  { value: 'branding', label: 'Branding' },
  { value: 'geospatial', label: 'Geospatial' },
];

const VISIBILITY_OPTIONS: { value: VaultVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(',')[1];
      if (base64 === undefined) {
        reject(new Error('Failed to read file as base64'));
      } else {
        resolve(base64);
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

export default function VaultUploadTab({
  orgId,
  defaultCategory = 'photo',
  defaultVisibility = 'public',
  defaultIsAiContext = false,
  onUploaded,
}: VaultUploadTabProps) {
  const [category, setCategory] = useState<VaultCategory>(defaultCategory);
  const [visibility, setVisibility] = useState<VaultVisibility>(defaultVisibility);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];

      setError(null);
      setUploading(true);
      setProgress('Reading file…');

      try {
        const base64 = await fileToBase64(file);
        setProgress('Uploading…');

        const result = await uploadToVault({
          orgId,
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            base64,
          },
          category,
          visibility,
          isAiContext: defaultIsAiContext,
        });

        if ('error' in result) {
          setError(result.error);
        } else {
          setProgress(null);
          onUploaded(result.item);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        setProgress(null);
      }
    },
    [orgId, category, visibility, defaultIsAiContext, onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Category + Visibility selects */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as VaultCategory)}
            className="input-field"
            disabled={uploading}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as VaultVisibility)}
            className="input-field"
            disabled={uploading}
          >
            {VISIBILITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-sage-light bg-sage-light/10'
            : uploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-300 hover:border-sage-light hover:bg-sage-light/5'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3 pointer-events-none">
          {uploading ? (
            <>
              <svg
                className="w-10 h-10 text-sage animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="text-sm text-forest-dark font-medium">{progress ?? 'Uploading…'}</p>
            </>
          ) : (
            <>
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {isDragActive ? (
                <p className="text-sm text-sage font-medium">Drop the file here</p>
              ) : (
                <>
                  <p className="text-sm text-forest-dark font-medium">
                    Drop files here or click to browse
                  </p>
                  <p className="text-xs text-gray-400">Any file type accepted</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
