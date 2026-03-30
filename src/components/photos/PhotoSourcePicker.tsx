'use client';

import { useState } from 'react';
import { isGooglePhotosConfigured } from '@/lib/google/picker';
import DeviceSource from './DeviceSource';
import GooglePhotosSource from './GooglePhotosSource';

interface PhotoSourcePickerProps {
  accept: string;
  maxFiles?: number;
  maxWidth?: number;
  capture?: string;
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
}

type Source = 'device' | 'google';

export default function PhotoSourcePicker({
  accept,
  maxFiles = 5,
  maxWidth,
  capture,
  onFilesSelected,
  multiple = true,
}: PhotoSourcePickerProps) {
  const googleConfigured = isGooglePhotosConfigured();
  const [activeSource, setActiveSource] = useState<Source>('device');

  if (!googleConfigured) {
    return (
      <DeviceSource
        accept={accept}
        maxFiles={maxFiles}
        capture={capture}
        multiple={multiple}
        onFilesSelected={onFilesSelected}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveSource('device')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeSource === 'device'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Device
        </button>
        <button
          type="button"
          onClick={() => setActiveSource('google')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeSource === 'google'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Google Photos
        </button>
      </div>

      {activeSource === 'device' && (
        <DeviceSource
          accept={accept}
          maxFiles={maxFiles}
          capture={capture}
          multiple={multiple}
          onFilesSelected={onFilesSelected}
        />
      )}

      {activeSource === 'google' && (
        <GooglePhotosSource
          maxFiles={maxFiles}
          maxWidth={maxWidth}
          onFilesSelected={onFilesSelected}
        />
      )}
    </div>
  );
}
