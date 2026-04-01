'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { pageConfig } from '@/lib/puck/config';
import { savePuckPageDraft, publishPuckPages } from '@/app/admin/site-builder/actions';
import { PuckSuggestionsProvider } from '@/lib/puck/fields';
import type { Data } from '@puckeditor/core';
import { useState, useCallback } from 'react';

interface PuckPageEditorProps {
  initialData: Data;
  pagePath: string;
}

export function PuckPageEditor({ initialData, pagePath }: PuckPageEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [puckData, setPuckData] = useState<Data>(initialData);

  const handleChange = useCallback(async (data: Data) => {
    setPuckData(data);
    setIsSaving(true);
    await savePuckPageDraft(pagePath, data);
    setIsSaving(false);
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
          data={initialData}
          onChange={handleChange}
          onPublish={handlePublish}
        />
      </PuckSuggestionsProvider>
    </div>
  );
}
