import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldDefinitionEditor, { type FieldDraft } from '../FieldDefinitionEditor';

describe('FieldDefinitionEditor', () => {
  const emptyFields: FieldDraft[] = [];

  it('renders "Add Field" button', () => {
    render(<FieldDefinitionEditor fields={emptyFields} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
  });

  it('calls onChange with a new field when Add Field is clicked', async () => {
    const onChange = vi.fn();
    render(<FieldDefinitionEditor fields={emptyFields} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add field/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const newFields = onChange.mock.calls[0][0];
    expect(newFields).toHaveLength(1);
    expect(newFields[0]).toMatchObject({ name: '', field_type: 'text', required: false });
  });

  it('renders existing fields with name inputs', () => {
    const fields: FieldDraft[] = [
      { name: 'Condition', field_type: 'text', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Condition')).toBeInTheDocument();
  });

  it('calls onChange when field name changes', async () => {
    const onChange = vi.fn();
    const fields: FieldDraft[] = [
      { name: '', field_type: 'text', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText(/field name/i), 'Cost');
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange when delete button is clicked', async () => {
    const onChange = vi.fn();
    const fields: FieldDraft[] = [
      { name: 'A', field_type: 'text', options: [], required: false },
      { name: 'B', field_type: 'number', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={onChange} />);
    const deleteButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(deleteButtons[0]);
    const newFields = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(newFields).toHaveLength(1);
    expect(newFields[0].name).toBe('B');
  });

  it('shows dropdown options input when field_type is dropdown', () => {
    const fields: FieldDraft[] = [
      { name: 'Status', field_type: 'dropdown', options: ['Good', 'Bad'], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Good, Bad')).toBeInTheDocument();
  });
});
