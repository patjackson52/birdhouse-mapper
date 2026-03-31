'use client';

import { useEffect, useState, useCallback } from 'react';
import { openGooglePhotosPicker, getAccessToken, type PickerResult } from '@/lib/google/picker';

/**
 * Standalone Google Photos Picker page — opened in a popup window.
 *
 * This page always runs on the platform domain (e.g., birdhouse-mapper.vercel.app),
 * which is registered as an authorized JavaScript origin in Google Cloud Console.
 * Custom tenant domains (e.g., fairbankseagle.org) open this page in a popup,
 * avoiding the need to register every custom domain with Google.
 *
 * Flow:
 * 1. Parent window opens this page as a popup with ?maxFiles=N
 * 2. This page runs OAuth + Google Picker
 * 3. User selects photos
 * 4. This page sends results back via postMessage
 * 5. This page closes itself
 */
export default function GooglePhotosPickerPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const runPicker = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const maxFiles = parseInt(params.get('maxFiles') || '5', 10);

    try {
      const results = await openGooglePhotosPicker(maxFiles);
      const token = getAccessToken();

      // Attach the OAuth token to each result so the parent can proxy downloads
      const resultsWithToken = results.map((r) => ({ ...r, token }));

      // Send results back to the parent window
      if (window.opener) {
        window.opener.postMessage(
          { type: 'google-photos-picked', results: resultsWithToken },
          '*' // Parent validates origin on its end
        );
      }

      window.close();
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : "Couldn't connect to Google Photos"
      );
    }
  }, []);

  useEffect(() => {
    runPicker();
  }, [runPicker]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Google Photos
          </h1>
          <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setStatus('loading');
                runPicker();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Try Again
            </button>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Connecting to Google Photos...</p>
    </div>
  );
}
