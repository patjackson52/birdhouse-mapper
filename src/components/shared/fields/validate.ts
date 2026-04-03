interface FieldDefinition {
  id: string;
  name: string;
  field_type: string;
  required: boolean;
}

export interface FieldValidationError {
  fieldId: string;
  fieldName: string;
  message: string;
}

export function validateFieldValues(
  fields: FieldDefinition[],
  values: Record<string, unknown>
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  for (const field of fields) {
    if (!field.required) continue;

    const value = values[field.id];
    const isEmpty = value === undefined || value === null || value === '';

    if (isEmpty) {
      errors.push({
        fieldId: field.id,
        fieldName: field.name,
        message: `${field.name} is required`,
      });
    }
  }

  return errors;
}
