'use client';

interface FieldDefinition {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date' | 'url';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface DynamicFieldRendererProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
}

const INPUT_TYPE_MAP: Record<string, string> = {
  text: 'text',
  number: 'number',
  date: 'date',
  url: 'url',
};

export default function DynamicFieldRenderer({ fields, values, onChange }: DynamicFieldRendererProps) {
  if (fields.length === 0) return null;

  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      {sorted.map((field) => {
        const labelId = `dynamic-field-${field.id}`;
        const raw = values[field.id];
        const value = raw != null ? String(raw) : '';

        function handleChange(newValue: string) {
          if (field.field_type === 'number') {
            onChange(field.id, newValue === '' ? '' : Number(newValue));
          } else {
            onChange(field.id, newValue);
          }
        }

        return (
          <div key={field.id}>
            <label htmlFor={labelId} className="label">
              {field.name}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>

            {field.field_type === 'dropdown' ? (
              <select
                id={labelId}
                className="input-field"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                required={field.required}
              >
                <option value="">Select...</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                id={labelId}
                type={INPUT_TYPE_MAP[field.field_type] ?? 'text'}
                className="input-field"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                required={field.required}
                placeholder={field.field_type === 'url' ? 'https://' : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
