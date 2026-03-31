'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PickerResult } from '@/lib/google/picker';
import { resizeImage } from '@/lib/utils';
import { useConfig } from '@/lib/config/client';

interface GooglePhotosSourceProps {
  maxFiles: number;
  maxWidth?: number;
  onFilesSelected: (files: File[]) => void;
}

type Status = 'idle' | 'authenticating' | 'downloading' | 'error';

/** Build the picker popup URL on the platform domain */
function getPickerUrl(maxFiles: number, platformDomain: string | null): string {
  if (platformDomain && platformDomain !== 'localhost') {
    // Use platform domain so OAuth origin always matches Google's authorized JS origins
    const protocol = platformDomain.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${platformDomain}/google-photos-picker?maxFiles=${maxFiles}`;
  }
  // Local dev or same-origin — use relative path
  return `/google-photos-picker?maxFiles=${maxFiles}`;
}

const POLL_INTERVAL = 500; // ms — check if popup was closed

export default function GooglePhotosSource({
  maxFiles,
  maxWidth,
  onFilesSelected,
}: GooglePhotosSourceProps) {
  const config = useConfig();
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      // Only accept google-photos-picked messages
      if (event.data?.type !== 'google-photos-picked') return;

      const results: PickerResult[] = event.data.results || [];

      if (results.length === 0) {
        setStatus('idle');
        return;
      }

      setStatus('downloading');
      setProgress({ done: 0, total: results.length });

      const files: File[] = [];
      let failCount = 0;

      await Promise.all(
        results.map(async (result) => {
          try {
            const response = await fetch('/api/photos/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: result.url, token: result.token }),
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
        setErrorMessage(`${failCount} of ${results.length} photos couldn't be downloaded`);
      } else if (files.length === 0) {
        setStatus('error');
        setErrorMessage("Couldn't download any photos. Please try again.");
      } else {
        setStatus('idle');
      }
    },
    [maxWidth, onFilesSelected]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  function handleBrowse() {
    setStatus('authenticating');
    setErrorMessage('');

    const url = getPickerUrl(maxFiles, config.platformDomain);
    const popup = window.open(url, 'google-photos-picker', 'width=900,height=600,scrollbars=yes');

    if (!popup) {
      setStatus('error');
      setErrorMessage('Popup was blocked. Please allow popups for this site.');
      return;
    }

    // Poll for popup close (user cancelled without selecting)
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        // Only reset if we're still in authenticating state (no message received)
        setStatus((current) => (current === 'authenticating' ? 'idle' : current));
      }
    }, POLL_INTERVAL);
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
