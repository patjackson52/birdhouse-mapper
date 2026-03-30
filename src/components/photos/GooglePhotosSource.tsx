'use client';

import { useState } from 'react';
import { openGooglePhotosPicker, type PickerResult } from '@/lib/google/picker';
import { resizeImage } from '@/lib/utils';

interface GooglePhotosSourceProps {
  maxFiles: number;
  maxWidth?: number;
  onFilesSelected: (files: File[]) => void;
}

type Status = 'idle' | 'authenticating' | 'downloading' | 'error';

export default function GooglePhotosSource({
  maxFiles,
  maxWidth,
  onFilesSelected,
}: GooglePhotosSourceProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  async function handleBrowse() {
    setStatus('authenticating');
    setErrorMessage('');

    let pickerResults: PickerResult[];
    try {
      pickerResults = await openGooglePhotosPicker(maxFiles);
    } catch (err) {
      setStatus('error');
      setErrorMessage("Couldn't connect to Google Photos. Try again or use Device.");
      return;
    }

    if (pickerResults.length === 0) {
      setStatus('idle');
      return;
    }

    setStatus('downloading');
    setProgress({ done: 0, total: pickerResults.length });

    const files: File[] = [];
    let failCount = 0;

    const accessToken = (window as any).google?.accounts?.oauth2?.getToken?.()?.access_token;

    await Promise.all(
      pickerResults.map(async (result) => {
        try {
          const response = await fetch('/api/photos/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: result.url, token: accessToken }),
          });

          if (!response.ok) {
            failCount++;
            return;
          }

          const blob = await response.blob();
          let finalBlob: Blob = blob;

          if (maxWidth) {
            try {
              const tempFile = new File([blob], result.name, { type: result.mimeType });
              finalBlob = await resizeImage(tempFile, maxWidth);
            } catch {
              // If resize fails, use original blob
            }
          }

          files.push(new File([finalBlob], result.name, { type: result.mimeType }));
        } catch {
          failCount++;
        } finally {
          setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      })
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }

    if (failCount > 0 && files.length > 0) {
      setStatus('error');
      setErrorMessage(`${failCount} of ${pickerResults.length} photos couldn't be downloaded`);
    } else if (files.length === 0) {
      setStatus('error');
      setErrorMessage("Couldn't download any photos. Please try again.");
    } else {
      setStatus('idle');
    }
  }

  return (
    <div className="text-center py-8">
      {status === 'idle' && (
        <div>
          <button type="button" onClick={handleBrowse} className="btn-primary">
            Browse Google Photos
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Select up to {maxFiles} photos from your Google Photos library
          </p>
        </div>
      )}

      {status === 'authenticating' && (
        <p className="text-sm text-gray-600">Connecting to Google Photos...</p>
      )}

      {status === 'downloading' && (
        <div>
          <p className="text-sm text-gray-600">
            Downloading {progress.done} of {progress.total} photos...
          </p>
          <div className="w-48 mx-auto mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-red-600 mb-2">{errorMessage}</p>
          <button type="button" onClick={handleBrowse} className="btn-secondary text-sm">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
