'use client';

import { useEffect, useState, useCallback } from 'react';
import { requestAccessToken, createSession } from '@/lib/google/picker';

/**
 * Standalone Google Photos Picker page — opened in a popup window.
 *
 * This page always runs on the platform domain (e.g., birdhouse-mapper.vercel.app),
 * which is registered as an authorized JavaScript origin in Google Cloud Console.
 * Custom tenant domains open this page in a popup so the OAuth origin always matches.
 *
 * New flow (Google Photos Picker API, post-March-2025):
 * 1. Parent opens this page as a popup with ?maxFiles=N
 * 2. This page gets an OAuth token via Google Identity Services
 * 3. This page creates a Picker session via the Photos Picker API
 * 4. This page sends session info (sessionId, token) back to parent via postMessage
 * 5. This page redirects to Google's pickerUri (with /autoclose)
 * 6. User selects photos in Google's UI
 * 7. Google auto-closes this popup window
 * 8. Parent polls the session and fetches selected media items
 */
export default function GooglePhotosPickerPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const runPicker = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const maxFiles = parseInt(params.get('maxFiles') || '5', 10);

    try {
      // Step 1: Get OAuth token
      const token = await requestAccessToken();

      // Step 2: Create a picker session
      const session = await createSession(token, maxFiles);

      // Step 3: Send session info to parent so it can poll
      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'google-photos-session',
            sessionId: session.id,
            token,
            pollingConfig: session.pollingConfig,
          },
          '*' // Parent validates origin on its end
        );
      }

      // Step 4: Redirect to Google's picker UI (auto-closes when done)
      window.location.href = session.pickerUri + '/autoclose';
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
