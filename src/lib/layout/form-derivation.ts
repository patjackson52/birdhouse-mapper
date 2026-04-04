import type { CustomField } from '@/lib/types';
import type { LayoutBlock, LayoutNode, FieldDisplayConfig, TextLabelConfig } from './types';
import { isLayoutRow } from './types';
import type { TypeLayout } from './types';

export interface FormSection {
  text: string;
  style: string;
  beforeFieldIndex: number;
}

export interface FormRow {
  fieldIds: string[];
}

export interface DerivedFormLayout {
  fields: CustomField[];
  rows: FormRow[];
  sections: FormSection[];
  photoPosition: number | null;
}

export function deriveFormFields(layout: TypeLayout, customFields: CustomField[]): DerivedFormLayout {
  const fieldMap = new Map<string, CustomField>(customFields.map((f) => [f.id, f]));

  const fields: CustomField[] = [];
  const rows: FormRow[] = [];
  const sections: FormSection[] = [];
  let photoPosition: number | null = null;

  // formElementIndex tracks position among form elements (fields + photo)
  let formElementIndex = 0;

  function processNode(node: LayoutNode): void {
    if (isLayoutRow(node)) {
      const rowFieldIds: string[] = [];

      for (const child of node.children) {
        if (child.type === 'field_display') {
          const field = fieldMap.get((child.config as FieldDisplayConfig).fieldId);
          if (field) {
            fields.push(field);
            rowFieldIds.push(field.id);
            formElementIndex++;
          }
        }
        // Non-field children inside rows are ignored
      }

      if (rowFieldIds.length >= 2) {
        rows.push({ fieldIds: rowFieldIds });
      }
      return;
    }

    switch (node.type) {
      case 'field_display': {
        const field = fieldMap.get((node.config as FieldDisplayConfig).fieldId);
        if (field) {
          fields.push(field);
          formElementIndex++;
        }
        break;
      }

      case 'photo_gallery': {
        photoPosition = formElementIndex;
        formElementIndex++;
        break;
      }

      case 'text_label': {
        const config = node.config as TextLabelConfig;
        sections.push({
          text: config.text,
          style: config.style,
          beforeFieldIndex: formElementIndex,
        });
        break;
      }

      // Explicitly skip these — handled as fixed form elements or display-only
      case 'status_badge':
      case 'entity_list':
      case 'timeline':
      case 'map_snippet':
      case 'action_buttons':
      case 'divider':
        break;
    }
  }

  for (const node of layout.blocks) {
    processNode(node);
  }

  return { fields, rows, sections, photoPosition };
}
