'use client';

import { useState, useEffect } from 'react';

interface FieldDefinition {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface DynamicFieldRendererProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
}

function FieldInput({
  field,
  externalValue,
  onChange,
}: {
  field: FieldDefinition;
  externalValue: unknown;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  const [internalValue, setInternalValue] = useState<string>(
    externalValue != null && externalValue !== '' ? String(externalValue) : ''
  );
  const labelId = `dynamic-field-${field.id}`;

  useEffect(() => {
    setInternalValue(externalValue != null && externalValue !== '' ? String(externalValue) : '');
  }, [externalValue]);

  const handleChange = (newValue: string) => {
    setInternalValue(newValue);
    if (field.field_type === 'number') {
      onChange(field.id, newValue === '' ? '' : Number(newValue));
    } else {
      onChange(field.id, newValue);
    }
  };

  if (field.field_type === 'text') {
    return (
      <input
        id={labelId}
        type="text"
        className="input-field"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        required={field.required}
      />
    );
  }

  if (field.field_type === 'number') {
    return (
      <input
        id={labelId}
        type="number"
        className="input-field"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        required={field.required}
      />
    );
  }

  if (field.field_type === 'dropdown') {
    return (
      <select
        id={labelId}
        className="input-field"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        required={field.required}
      >
        <option value="">Select...</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.field_type === 'date') {
    return (
      <input
        id={labelId}
        type="date"
        className="input-field"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        required={field.required}
      />
    );
  }

  return null;
}

export default function DynamicFieldRenderer({ fields, values, onChange }: DynamicFieldRendererProps) {
  if (fields.length === 0) return null;

  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      {sorted.map((field) => {
        const labelId = `dynamic-field-${field.id}`;

        return (
          <div key={field.id}>
            <label htmlFor={labelId} className="label">
              {field.name}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <FieldInput
              field={field}
              externalValue={values[field.id]}
              onChange={onChange}
            />
          </div>
        );
      })}
    </div>
  );
}
