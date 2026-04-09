import type { CustomField } from '@/lib/types';
import type { FieldDisplayConfig, TextLabelConfig, TypeLayout } from './types';
import type { TypeLayoutV2 } from './types-v2';

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
  descriptionPosition: number | null;
}

interface NodeLike {
  type: string;
  config: unknown;
  children?: NodeLike[];
}

export function deriveFormFields(layout: TypeLayout | TypeLayoutV2, customFields: CustomField[]): DerivedFormLayout {
  const fieldMap = new Map<string, CustomField>(customFields.map((f) => [f.id, f]));

  const fields: CustomField[] = [];
  const rows: FormRow[] = [];
  const sections: FormSection[] = [];
  let photoPosition: number | null = null;
  let descriptionPosition: number | null = null;
  let formElementIndex = 0;

  function processRow(children: NodeLike[]): void {
    const rowFieldIds: string[] = [];

    for (const child of children) {
      if (child.type === 'field_display') {
        const field = fieldMap.get((child.config as FieldDisplayConfig).fieldId);
        if (field) {
          fields.push(field);
          rowFieldIds.push(field.id);
          formElementIndex++;
        }
      }
    }

    if (rowFieldIds.length >= 2) {
      rows.push({ fieldIds: rowFieldIds });
    }
  }

  function processNode(node: NodeLike): void {
    if (node.type === 'row' && node.children) {
      processRow(node.children);
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

      case 'description': {
        descriptionPosition = formElementIndex;
        formElementIndex++;
        break;
      }

      default:
        break;
    }
  }

  for (const node of layout.blocks) {
    processNode(node as NodeLike);
  }

  return { fields, rows, sections, photoPosition, descriptionPosition };
}
