'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { pageConfig } from '@/lib/puck/config';
import { savePuckPageDraft, publishPuckPages } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback, useMemo, useRef } from 'react';
import { sanitizePuckData } from '@/lib/puck/sanitize-data';

function refreshPreviewWindow() {
  const preview = window.open('', 'puck-preview');
  if (preview && !preview.closed && preview.location.href !== 'about:blank') {
    preview.location.reload();
  }
}

interface PuckPageEditorProps {
  initialData: Data;
  pagePath: string;
}

export function PuckPageEditor({ initialData, pagePath }: PuckPageEditorProps) {
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
      await savePuckPageDraft(pagePath, data);
      setIsSaving(false);
      refreshPreviewWindow();
    }, 800);
  }, [pagePath]);

  const handlePublish = useCallback(async (data: Data) => {
    await savePuckPageDraft(pagePath, data);
    const result = await publishPuckPages();
    if ('error' in result && result.error) {
      alert(`Publish failed: ${result.error}`);
    }
  }, [pagePath]);

  return (
    <div className="h-screen">
      <PuckSuggestionsProvider data={puckData}>
        <Puck
          config={pageConfig}
          data={safeInitialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </PuckSuggestionsProvider>
    </div>
  );
}
