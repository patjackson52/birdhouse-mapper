'use client';

import { useState } from 'react';
import KnowledgePicker from '@/components/knowledge/KnowledgePicker';
import { getKnowledgeItem } from '@/lib/knowledge/actions';
import { useEffect } from 'react';

interface KnowledgePickerFieldProps {
  value: string;
  onChange: (val: string) => void;
  orgId: string;
}

export function KnowledgePickerField({ value, onChange, orgId }: KnowledgePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (value) {
      getKnowledgeItem(value).then(({ item }) => {
        if (item) setTitle(item.title);
      });
    }
  }, [value]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="input-field text-sm text-left w-full"
      >
        {title || value || 'Select knowledge article…'}
      </button>

      {showPicker && (
        <KnowledgePicker
          orgId={orgId}
          onSelect={(items) => {
            if (items.length > 0) {
              onChange(items[0].id);
              setTitle(items[0].title);
            }
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
