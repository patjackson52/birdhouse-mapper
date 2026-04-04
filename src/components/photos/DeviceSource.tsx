'use client';

import { useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface DeviceSourceProps {
  accept: string;
  maxFiles: number;
  multiple: boolean;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

function parseAccept(accept: string): Record<string, string[]> {
  const types = accept.split(',').map((t) => t.trim());
  const result: Record<string, string[]> = {};
  for (const type of types) {
    result[type] = [];
  }
  return result;
}

export default function DeviceSource({
  accept,
  maxFiles,
  multiple,
  onFilesSelected,
  disabled = false,
}: DeviceSourceProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (disabled || acceptedFiles.length === 0) return;
      const limited = acceptedFiles.slice(0, maxFiles);
      onFilesSelected(limited);
    },
    [disabled, maxFiles, onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: parseAccept(accept),
    maxFiles,
    multiple,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input {...getInputProps()} />
      <p className="text-gray-600 mb-1">
        {isDragActive ? 'Drop files here' : 'Drop files here or tap to browse'}
      </p>
      <p className="text-xs text-gray-400">
        {multiple ? `Up to ${maxFiles} files` : '1 file'}
      </p>
    </div>
  );
}
