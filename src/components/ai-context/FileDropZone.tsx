'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, FileImage, FileSpreadsheet, Globe, MapPin, File as FileIcon, X } from 'lucide-react';
import { getSupportedExtensions } from '@/lib/ai-context/parsers';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onUrlSubmit?: (url: string) => void;
  onTextSubmit?: (text: string, label: string) => void;
  disabled?: boolean;
}

type Tab = 'files' | 'url' | 'text';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(file: File): React.ReactNode {
  const type = file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (type.startsWith('image/')) {
    return <FileImage className="w-5 h-5 text-blue-500 shrink-0" />;
  }
  if (type === 'application/pdf') {
    return <FileText className="w-5 h-5 text-red-500 shrink-0" />;
  }
  if (
    type === 'text/csv' ||
    type === 'text/tab-separated-values' ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel' ||
    ext === 'csv' ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'tsv'
  ) {
    return <FileSpreadsheet className="w-5 h-5 text-green-500 shrink-0" />;
  }
  if (
    type === 'application/geo+json' ||
    type === 'application/vnd.google-earth.kml+xml' ||
    type === 'application/vnd.google-earth.kmz' ||
    type === 'application/gpx+xml' ||
    ext === 'geojson' ||
    ext === 'kml' ||
    ext === 'kmz' ||
    ext === 'gpx' ||
    ext === 'shp'
  ) {
    return <MapPin className="w-5 h-5 text-cyan-500 shrink-0" />;
  }
  if (type.startsWith('text/')) {
    return <FileText className="w-5 h-5 text-stone-400 shrink-0" />;
  }
  return <FileIcon className="w-5 h-5 text-stone-400 shrink-0" />;
}

export default function FileDropZone({
  onFilesSelected,
  onUrlSubmit,
  onTextSubmit,
  disabled = false,
}: FileDropZoneProps) {
  const [activeTab, setActiveTab] = useState<Tab>('files');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textLabel, setTextLabel] = useState('');

  const supportedExtensions = getSupportedExtensions();
  const accept = supportedExtensions.reduce<Record<string, string[]>>((acc, ext) => {
    // react-dropzone accept keys are MIME types; use a catch-all for each extension
    // We'll use the extensions directly via the accept object with dot-prefixed keys
    acc[`.${ext}`] = [];
    return acc;
  }, {});

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (disabled) return;
      const updated = [...selectedFiles, ...acceptedFiles];
      setSelectedFiles(updated);
      onFilesSelected(updated);
    },
    [disabled, selectedFiles, onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    // Pass accepted file types as extension strings
    accept: supportedExtensions.reduce<Record<string, string[]>>((acc, ext) => {
      acc[`.${ext}`] = [];
      return acc;
    }, {}),
  });

  function removeFile(index: number) {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    onFilesSelected(updated);
  }

  function handleAddUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed || !onUrlSubmit) return;
    onUrlSubmit(trimmed);
    setUrlInput('');
  }

  function handleAddText() {
    const trimmedText = textInput.trim();
    if (!trimmedText || !onTextSubmit) return;
    onTextSubmit(trimmedText, textLabel.trim());
    setTextInput('');
    setTextLabel('');
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'files', label: 'Files' },
    { id: 'url', label: 'URL' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-500 text-white font-medium shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Files tab */}
      {activeTab === 'files' && (
        <div className="space-y-3">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragActive
                ? 'border-amber-400 bg-amber-50'
                : disabled
                  ? 'border-stone-200 bg-stone-50 cursor-not-allowed'
                  : 'border-stone-300 bg-white hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2">
              <FileIcon
                className={`w-8 h-8 ${isDragActive ? 'text-amber-500' : 'text-stone-400'}`}
              />
              {isDragActive ? (
                <p className="text-sm font-medium text-amber-600">Drop files here</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-stone-700">
                    Drag files here, or click to browse
                  </p>
                  <p className="text-xs text-stone-400">
                    Supports: {supportedExtensions.join(', ')}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <ul className="space-y-2">
              {selectedFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-3 p-2 bg-stone-50 rounded-md">
                  {getFileIcon(file)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{file.name}</p>
                    <p className="text-xs text-stone-400">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={disabled}
                    className="p-1 text-stone-400 hover:text-red-500 transition-colors rounded disabled:cursor-not-allowed"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* URL tab */}
      {activeTab === 'url' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                placeholder="https://example.com/data.geojson"
                disabled={disabled}
                className="input-field pl-9 w-full"
              />
            </div>
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={disabled || !urlInput.trim()}
              className="btn-primary whitespace-nowrap"
            >
              Add URL
            </button>
          </div>
          <p className="text-xs text-stone-400">
            Enter a URL pointing to a supported file (GeoJSON, CSV, KML, etc.)
          </p>
        </div>
      )}

      {/* Text tab */}
      {activeTab === 'text' && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="text-label">
              Label <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="text-label"
              type="text"
              value={textLabel}
              onChange={(e) => setTextLabel(e.target.value)}
              placeholder="e.g. Field notes"
              disabled={disabled}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="label" htmlFor="text-content">
              Content
            </label>
            <textarea
              id="text-content"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste or type text here..."
              rows={6}
              disabled={disabled}
              className="input-field w-full resize-y"
            />
          </div>
          <button
            type="button"
            onClick={handleAddText}
            disabled={disabled || !textInput.trim()}
            className="btn-primary"
          >
            Add Text
          </button>
        </div>
      )}
    </div>
  );
}
