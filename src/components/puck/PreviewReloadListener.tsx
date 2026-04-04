'use client';

import { useEffect } from 'react';

/**
 * Listens for BroadcastChannel messages from the Puck editor
 * and reloads the preview window when content is saved.
 */
export function PreviewReloadListener() {
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('puck-preview');
      channel.onmessage = (event) => {
        if (event.data?.type === 'reload') {
          window.location.reload();
        }
      };
      return () => channel.close();
    } catch {
      // BroadcastChannel not supported
    }
  }, []);

  return null;
}
