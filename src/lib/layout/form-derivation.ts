import type { CustomField } from '@/lib/types';
import type { LayoutNode, FieldDisplayConfig, TextLabelConfig, TypeLayout } from './types';
import type { TypeLayoutV2, LayoutNodeV2 } from './types-v2';
import { isLayoutRow } from './types';
import { isLayoutRowV2 } from './types-v2';

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

export function deriveFormFields(layout: TypeLayout | TypeLayoutV2, customFields: CustomField[]): DerivedFormLayout {
  if (layout.version === 2) {
    return deriveFormFieldsV2(layout as TypeLayoutV2, customFields);
  }
  return deriveFormFieldsV1(layout as TypeLayout, customFields);
}

function deriveFormFieldsV1(layout: TypeLayout, customFields: CustomField[]): DerivedFormLayout {
  const fieldMap = new Map<string, CustomField>(customFields.map((f) => [f.id, f]));

  const fields: CustomField[] = [];
  const rows: FormRow[] = [];
  const sections: FormSection[] = [];
  let photoPosition: number | null = null;
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

  return { fields, rows, sections, photoPosition, descriptionPosition: null };
}

function deriveFormFieldsV2(layout: TypeLayoutV2, customFields: CustomField[]): DerivedFormLayout {
  const fieldMap = new Map<string, CustomField>(customFields.map((f) => [f.id, f]));

  const fields: CustomField[] = [];
  const rows: FormRow[] = [];
  const sections: FormSection[] = [];
  let photoPosition: number | null = null;
  let descriptionPosition: number | null = null;
  let formElementIndex = 0;

  function processNode(node: LayoutNodeV2): void {
    if (isLayoutRowV2(node)) {
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

      case 'description': {
        descriptionPosition = formElementIndex;
        formElementIndex++;
        break;
      }

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

  return { fields, rows, sections, photoPosition, descriptionPosition };
}
