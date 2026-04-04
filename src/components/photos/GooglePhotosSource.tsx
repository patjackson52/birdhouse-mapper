'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSession,
  listMediaItems,
  deleteSession,
  parseDuration,
  type PickedMediaItem,
} from '@/lib/google/picker';
import { resizeImage } from '@/lib/utils';
import { useConfig } from '@/lib/config/client';

interface GooglePhotosSourceProps {
  maxFiles: number;
  maxWidth?: number;
  onFilesSelected: (files: File[]) => void;
}

type Status = 'idle' | 'authenticating' | 'selecting' | 'downloading' | 'error';

/** Build the picker popup URL on the platform domain */
function getPickerUrl(maxFiles: number, platformDomain: string | null): string {
  if (platformDomain && platformDomain !== 'localhost') {
    const protocol = platformDomain.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${platformDomain}/google-photos-picker?maxFiles=${maxFiles}`;
  }
  return `/google-photos-picker?maxFiles=${maxFiles}`;
}

/** Download a photo from its baseUrl via the server-side proxy */
async function downloadPhoto(
  baseUrl: string,
  token: string,
  filename: string,
  mimeType: string,
  maxWidth?: number
): Promise<File | null> {
  // Append size params to baseUrl — use =d for original quality,
  // or =w{maxWidth} to let Google resize server-side
  const sizedUrl = maxWidth ? `${baseUrl}=w${maxWidth}` : `${baseUrl}=d`;

  const response = await fetch('/api/photos/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sizedUrl, token }),
  });

  if (!response.ok) return null;

  const blob = await response.blob();
  let finalBlob: Blob = blob;

  if (maxWidth) {
    try {
      const tempFile = new File([blob], filename, { type: mimeType });
      finalBlob = await resizeImage(tempFile, maxWidth);
    } catch {
      // If resize fails, use original blob
    }
  }

  return new File([finalBlob], filename, { type: mimeType });
}

const POLL_CLOSED_INTERVAL = 500; // ms — check if popup was closed

export default function GooglePhotosSource({
  maxFiles,
  maxWidth,
  onFilesSelected,
}: GooglePhotosSourceProps) {
  const config = useConfig();
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const handleSessionMessage = useCallback(
    async (event: MessageEvent) => {
      // Accept the new session-based message from the picker popup
      if (event.data?.type !== 'google-photos-session') return;

      const { sessionId, token, pollingConfig } = event.data;
      if (!sessionId || !token) return;

      setStatus('selecting');

      const pollInterval = parseDuration(pollingConfig?.pollInterval || '3s');
      const timeout = parseDuration(pollingConfig?.timeoutIn || '600s');
      const deadline = Date.now() + timeout;

      // Poll the session until the user finishes selecting
      const poll = async () => {
        try {
          if (Date.now() > deadline) {
            setStatus('error');
            setErrorMessage('Selection timed out. Please try again.');
            await deleteSession(token, sessionId).catch(() => {});
            return;
          }

          const session = await getSession(token, sessionId);

          if (!session.mediaItemsSet) {
            pollingRef.current = setTimeout(poll, pollInterval);
            return;
          }

          // User finished selecting — fetch the media items
          const items = await listMediaItems(token, sessionId);

          if (items.length === 0) {
            setStatus('idle');
            await deleteSession(token, sessionId).catch(() => {});
            return;
          }

          // Download selected photos
          setStatus('downloading');
          setProgress({ done: 0, total: items.length });

          const files: File[] = [];
          let failCount = 0;

          await Promise.all(
            items.map(async (item: PickedMediaItem) => {
              try {
                const file = await downloadPhoto(
                  item.mediaFile.baseUrl,
                  token,
                  item.mediaFile.filename || 'photo.jpg',
                  item.mediaFile.mimeType || 'image/jpeg',
                  maxWidth
                );
                if (file) {
                  files.push(file);
                } else {
                  failCount++;
                }
              } catch {
                failCount++;
              } finally {
                setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
              }
            })
          );

          // Clean up session
          await deleteSession(token, sessionId).catch(() => {});

          if (files.length > 0) {
            onFilesSelected(files);
          }

          if (failCount > 0 && files.length > 0) {
            setStatus('error');
            setErrorMessage(
              `${failCount} of ${items.length} photos couldn't be downloaded`
            );
          } else if (files.length === 0) {
            setStatus('error');
            setErrorMessage("Couldn't download any photos. Please try again.");
          } else {
            setStatus('idle');
          }
        } catch (err) {
          setStatus('error');
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to fetch photos'
          );
        }
      };

      // Start polling
      pollingRef.current = setTimeout(poll, pollInterval);
    },
    [maxWidth, onFilesSelected]
  );

  useEffect(() => {
    window.addEventListener('message', handleSessionMessage);
    return () => window.removeEventListener('message', handleSessionMessage);
  }, [handleSessionMessage]);

  function handleBrowse() {
    setStatus('authenticating');
    setErrorMessage('');

    const url = getPickerUrl(maxFiles, config.platformDomain);
    const popup = window.open(
      url,
      'google-photos-picker',
      'width=900,height=600,scrollbars=yes'
    );

    if (!popup) {
      setStatus('error');
      setErrorMessage('Popup was blocked. Please allow popups for this site.');
      return;
    }

    // Poll for popup close (user cancelled without selecting)
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        // Only reset if still in authenticating state (no session message received yet)
        setStatus((current) =>
          current === 'authenticating' ? 'idle' : current
        );
      }
    }, POLL_CLOSED_INTERVAL);
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

      {status === 'selecting' && (
        <p className="text-sm text-gray-600">
          Select your photos in the Google Photos window...
        </p>
      )}

      {status === 'downloading' && (
        <div>
          <p className="text-sm text-gray-600">
            Downloading {progress.done} of {progress.total} photos...
          </p>
          <div className="w-48 mx-auto mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{
                width: `${
                  progress.total > 0
                    ? (progress.done / progress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-red-600 mb-2">{errorMessage}</p>
          <button
            type="button"
            onClick={handleBrowse}
            className="btn-secondary text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
