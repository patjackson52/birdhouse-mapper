'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { CustomField } from '@/lib/types';
import { deriveFormFields } from '@/lib/layout/form-derivation';

interface Props {
  layout: TypeLayout;
  customFields: CustomField[];
  itemTypeName: string;
}

export default function FormPreview({ layout, customFields, itemTypeName }: Props) {
  const derived = deriveFormFields(layout, customFields);

  return (
    <div className="bg-gray-100 rounded-xl p-3">
      <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
        <h3 className="font-heading font-semibold text-forest-dark text-lg">
          Add {itemTypeName}
        </h3>

        {/* Fixed: Name */}
        <div>
          <label className="label">Name <span className="text-red-500">*</span></label>
          <input type="text" className="input-field" placeholder={`e.g., ${itemTypeName} #1`} disabled />
        </div>

        {/* Fixed: Location */}
        <div>
          <label className="label">Location <span className="text-red-500">*</span></label>
          <div className="h-24 bg-sage-light/50 rounded-lg flex items-center justify-center text-xs text-sage">
            Location picker
          </div>
        </div>

        {/* Layout-derived fields with sections */}
        {derived.fields.map((field, index) => {
          const section = derived.sections.find((s) => s.beforeFieldIndex === index);
          const isInRow = derived.rows.some((r) => r.fieldIds.includes(field.id));

          // Check if this is the start of a row
          const row = derived.rows.find((r) => r.fieldIds[0] === field.id);
          const rowFields = row ? row.fieldIds.map((id) => derived.fields.find((f) => f.id === id)).filter(Boolean) : null;

          if (isInRow && !row) return null; // Will be rendered as part of the row

          return (
            <div key={field.id}>
              {section && (
                <p className="text-sm font-semibold text-forest-dark mt-2">{section.text}</p>
              )}
              {rowFields ? (
                <div className="grid grid-cols-2 gap-3">
                  {rowFields.map((rf) => rf && (
                    <div key={rf.id}>
                      <label className="label">
                        {rf.name} {rf.required && <span className="text-red-500">*</span>}
                      </label>
                      {renderFieldInput(rf)}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="label">
                    {field.name} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {renderFieldInput(field)}
                </div>
              )}
            </div>
          );
        })}

        {/* Photo uploader placeholder */}
        <div>
          <label className="label">Photos</label>
          <div className="h-16 border-2 border-dashed border-sage-light rounded-lg flex items-center justify-center text-xs text-sage">
            + Add photos
          </div>
        </div>

        {/* Fixed: Submit */}
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
