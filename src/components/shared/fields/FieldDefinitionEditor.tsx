'use client';

export interface FieldDraft {
  id?: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[];
  required: boolean;
}

interface FieldDefinitionEditorProps {
  fields: FieldDraft[];
  onChange: (fields: FieldDraft[]) => void;
}

export default function FieldDefinitionEditor({ fields, onChange }: FieldDefinitionEditorProps) {
  function addField() {
    onChange([...fields, { name: '', field_type: 'text', options: [], required: false }]);
  }

  function updateField(index: number, updates: Partial<FieldDraft>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange(next);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const next = [...fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-sage">Custom Fields</span>
        <button type="button" onClick={addField} className="text-xs text-forest hover:text-forest-dark">
          + Add Field
        </button>
      </div>

      {fields.map((field, i) => (
        <div key={field.id ?? `new-${i}`} className="bg-sage-light rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={field.name}
              onChange={(e) => updateField(i, { name: e.target.value })}
              placeholder="Field name"
              className="input-field text-sm flex-1"
            />
            <select
              value={field.field_type}
              onChange={(e) => updateField(i, { field_type: e.target.value as FieldDraft['field_type'], options: [] })}
              className="input-field text-sm w-28"
              aria-label="Field type"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="dropdown">Dropdown</option>
              <option value="date">Date</option>
            </select>
          </div>

          {field.field_type === 'dropdown' && (
            <input
              type="text"
              value={field.options.join(', ')}
              onChange={(e) => updateField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="Options (comma-separated)"
              className="input-field text-sm"
            />
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-sage">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(i, { required: e.target.checked })}
              />
              Required
            </label>
            <div className="flex gap-1">
              <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                className="text-xs text-sage hover:text-forest disabled:opacity-30" aria-label="Move up">
                &uarr;
              </button>
              <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                className="text-xs text-sage hover:text-forest disabled:opacity-30" aria-label="Move down">
                &darr;
              </button>
              <button type="button" onClick={() => removeField(i)}
                className="text-xs text-red-600 hover:text-red-800" aria-label="Remove">
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
