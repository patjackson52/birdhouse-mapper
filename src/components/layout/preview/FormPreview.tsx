'use client';

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
  const derived = deriveFormFields(layout, customFields);

  // Build a list of form elements (fields + description) in layout order
  const formElements: React.ReactNode[] = [];
  let fieldIndex = 0;

  // Track which field indices we've rendered (for row grouping)
  const renderedFieldIndices = new Set<number>();

  for (let i = 0; i <= derived.fields.length; i++) {
    // Insert section header if one exists at this position
    const section = derived.sections.find((s) => s.beforeFieldIndex === i);
    if (section) {
      formElements.push(
        <p key={`section-${i}`} className="text-sm font-semibold text-forest-dark mt-2">{section.text}</p>
      );
    }

    // Insert description if it appears at this position
    if (derived.descriptionPosition === i) {
      formElements.push(
        <div key="description">
          <label className="label">Description</label>
          <textarea
            className="input-field"
            rows={3}
            placeholder="Enter description..."
            disabled
          />
        </div>
      );
    }

    // Render field at this index (if not already rendered as part of a row)
    if (i < derived.fields.length && !renderedFieldIndices.has(i)) {
      const field = derived.fields[i];
      const isInRow = derived.rows.some((r) => r.fieldIds.includes(field.id));
      const row = derived.rows.find((r) => r.fieldIds[0] === field.id);

      if (row) {
        // Render the whole row
        const rowFields = row.fieldIds
          .map((id) => derived.fields.find((f) => f.id === id))
          .filter(Boolean) as CustomField[];

        // Mark all row fields as rendered
        for (const rf of rowFields) {
          const rfIdx = derived.fields.findIndex((f) => f.id === rf.id);
          if (rfIdx !== -1) renderedFieldIndices.add(rfIdx);
        }

        formElements.push(
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
      } else if (!isInRow) {
        renderedFieldIndices.add(i);
        formElements.push(
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

  // Handle description at end (after all fields)
  if (derived.descriptionPosition !== null && derived.descriptionPosition >= derived.fields.length) {
    // Already handled in the loop above
  }

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

        {/* Layout-derived fields, sections, and description */}
        {formElements}

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
