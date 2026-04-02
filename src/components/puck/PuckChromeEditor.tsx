'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { chromeConfig } from '@/lib/puck/chrome-config';
import { savePuckRootDraft, publishPuckRoot } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback, useMemo } from 'react';
import { sanitizePuckData } from '@/lib/puck/sanitize-data';

interface PuckChromeEditorProps {
  initialData: Data;
}

export function PuckChromeEditor({ initialData }: PuckChromeEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const safeInitialData = useMemo(() => sanitizePuckData(initialData), [initialData]);
  const [puckData, setPuckData] = useState<Data>(safeInitialData);

  const handleChange = useCallback(async (data: Data) => {
    const safeData = sanitizePuckData(data);
    setPuckData(safeData);
    setIsSaving(true);
    await savePuckRootDraft(safeData);
    setIsSaving(false);
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
