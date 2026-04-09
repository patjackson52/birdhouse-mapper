'use client';

import { useMemo } from 'react';
import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { CustomField } from '@/lib/types';
import { deriveFormFields } from '@/lib/layout/form-derivation';

interface Props {
  layout: TypeLayout | TypeLayoutV2;
  customFields: CustomField[];
  itemTypeName: string;
}

export default function FormPreview({ layout, customFields, itemTypeName }: Props) {
  const derived = useMemo(() => deriveFormFields(layout, customFields), [layout, customFields]);

  const formElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    const renderedFieldIndices = new Set<number>();

    // Pre-build lookup maps to avoid O(n²) searches
    const sectionsByIndex = new Map(derived.sections.map((s) => [s.beforeFieldIndex, s]));
    const fieldIndexById = new Map(derived.fields.map((f, i) => [f.id, i]));
    const rowByLeadFieldId = new Map(derived.rows.map((r) => [r.fieldIds[0], r]));
    const fieldsInRows = new Set(derived.rows.flatMap((r) => r.fieldIds));

    for (let i = 0; i <= derived.fields.length; i++) {
      const section = sectionsByIndex.get(i);
      if (section) {
        elements.push(
          <p key={`section-${i}`} className="text-sm font-semibold text-forest-dark mt-2">{section.text}</p>
        );
      }

      if (derived.descriptionPosition === i) {
        elements.push(
          <div key="description">
            <label className="label">Description</label>
            <textarea className="input-field" rows={3} placeholder="Enter description..." disabled />
          </div>
        );
      }

      if (i < derived.fields.length && !renderedFieldIndices.has(i)) {
        const field = derived.fields[i];
        const row = rowByLeadFieldId.get(field.id);

        if (row) {
          const rowFields = row.fieldIds
            .map((id) => {
              const idx = fieldIndexById.get(id);
              if (idx !== undefined) renderedFieldIndices.add(idx);
              return derived.fields[idx!];
            })
            .filter(Boolean);

          elements.push(
            <div key={`row-${field.id}`} className="grid grid-cols-2 gap-3">
              {rowFields.map((rf) => (
                <div key={rf.id}>
                  <label className="label">
                    {rf.name} {rf.required && <span className="text-red-500">*</span>}
                  </label>
                  {renderFieldInput(rf)}
                </div>
              ))}
            </div>
          );
        } else if (!fieldsInRows.has(field.id)) {
          renderedFieldIndices.add(i);
          elements.push(
            <div key={field.id}>
              <label className="label">
                {field.name} {field.required && <span className="text-red-500">*</span>}
              </label>
              {renderFieldInput(field)}
            </div>
          );
        }
      }
    }

    return elements;
  }, [derived]);

  return (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
        <h3 className="font-heading font-semibold text-forest-dark text-lg">
          Add {itemTypeName}
        </h3>

        <div>
          <label className="label">Name <span className="text-red-500">*</span></label>
          <input type="text" className="input-field" placeholder={`e.g., ${itemTypeName} #1`} disabled />
        </div>

        <div>
          <label className="label">Location <span className="text-red-500">*</span></label>
          <div className="h-24 bg-sage-light/50 rounded-lg flex items-center justify-center text-xs text-sage">
            Location picker
          </div>
        </div>

        {formElements}

        <div>
          <label className="label">Photos</label>
          <div className="h-16 border-2 border-dashed border-sage-light rounded-lg flex items-center justify-center text-xs text-sage">
            + Add photos
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1 opacity-60 cursor-default">Save</button>
          <button className="btn-secondary flex-1 opacity-60 cursor-default">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function renderFieldInput(field: CustomField) {
  switch (field.field_type) {
    case 'dropdown':
      return (
        <select className="input-field" disabled>
          <option>Select {field.name}...</option>
          {field.options?.map((opt) => <option key={opt}>{opt}</option>)}
        </select>
      );
    case 'number':
      return <input type="number" className="input-field" placeholder="0" disabled />;
    case 'date':
      return <input type="date" className="input-field" disabled />;
    default:
      return <input type="text" className="input-field" placeholder={`Enter ${field.name.toLowerCase()}`} disabled />;
  }
}
