'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { chromeConfig } from '@/lib/puck/chrome-config';
import { savePuckRootDraft, publishPuckRoot } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback, useMemo, useRef } from 'react';
import { sanitizePuckData } from '@/lib/puck/sanitize-data';

function refreshPreviewWindow() {
  // Use BroadcastChannel to signal the preview window to reload.
  // Avoids window.open('', name) which creates a new about:blank window
  // if no preview window exists.
  try {
    const channel = new BroadcastChannel('puck-preview');
    channel.postMessage({ type: 'reload' });
    channel.close();
  } catch {
    // BroadcastChannel not supported — no-op
  }
}

interface PuckChromeEditorProps {
  initialData: Data;
}

export function PuckChromeEditor({ initialData }: PuckChromeEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const safeInitialData = useMemo(() => sanitizePuckData(initialData), [initialData]);
  const [puckData, setPuckData] = useState<Data>(safeInitialData);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(async (data: Data) => {
    setPuckData(data);

    // Debounce saves to avoid hammering the server on every keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsSaving(true);
    saveTimerRef.current = setTimeout(async () => {
      await savePuckRootDraft(data);
      setIsSaving(false);
      refreshPreviewWindow();
    }, 800);
  }, []);

  const handlePublish = useCallback(async (data: Data) => {
    await savePuckRootDraft(data);
    const result = await publishPuckRoot();
    if ('error' in result) {
      alert(`Publish failed: ${result.error}`);
    }
  }, []);

  return (
    <div className="h-screen">
      <PuckSuggestionsProvider data={puckData}>
        <Puck
          config={chromeConfig}
          data={safeInitialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </PuckSuggestionsProvider>
    </div>
  );
}
