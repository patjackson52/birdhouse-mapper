'use client';

import { useState } from 'react';
import type { FieldType } from '@/lib/types';

interface NewFieldData {
  name: string;
  field_type: FieldType;
  options: string[];
  required: boolean;
}

interface Props {
  onCreateField: (field: NewFieldData) => void;
  onCancel: () => void;
}

export default function InlineFieldCreator({ onCreateField, onCancel }: Props) {
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreateField({
      name: name.trim(),
      field_type: fieldType,
      options: fieldType === 'dropdown' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [],
      required,
    });
  };

  return (
    <div className="space-y-3 p-3 bg-sage-light/30 rounded-lg border border-sage-light">
      <div>
        <label className="label">Field Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          placeholder="e.g., Target Species"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Type</label>
        <div className="flex gap-1">
          {(['text', 'number', 'dropdown', 'date'] as FieldType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFieldType(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                fieldType === t
                  ? 'bg-forest text-white'
                  : 'bg-white border border-sage-light text-forest-dark hover:bg-sage-light/50'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {fieldType === 'dropdown' && (
        <div>
          <label className="label">Options (comma-separated)</label>
          <input
            type="text"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="input-field"
            placeholder="Robin, Wren, Blue Tit"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="field-required"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="field-required" className="text-sm text-forest-dark">Required</label>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSubmit} className="btn-primary text-sm" disabled={!name.trim()}>
          Create Field
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
