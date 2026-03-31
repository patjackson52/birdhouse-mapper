'use client';

import { Puck } from '@puckeditor/core';
import '@puckeditor/core/dist/index.css';
import { chromeConfig } from '@/lib/puck/chrome-config';
import { savePuckRootDraft, publishPuckRoot } from '@/app/admin/site-builder/actions';
import type { Data } from '@puckeditor/core';
import { useState, useCallback } from 'react';

interface PuckChromeEditorProps {
  initialData: Data;
}

export function PuckChromeEditor({ initialData }: PuckChromeEditorProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = useCallback(async (data: Data) => {
    setIsSaving(true);
    await savePuckRootDraft(data);
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
      <Puck
        config={chromeConfig}
        data={initialData}
        onChange={handleChange}
        onPublish={handlePublish}
      />
    </div>
  );
}
