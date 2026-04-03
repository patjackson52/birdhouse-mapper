import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicFieldRenderer from '../DynamicFieldRenderer';

const textField = {
  id: 'f1', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Notes', field_type: 'text' as const, options: null,
  required: false, sort_order: 0,
};

const numberField = {
  id: 'f2', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Cost', field_type: 'number' as const, options: null,
  required: true, sort_order: 1,
};

const dropdownField = {
  id: 'f3', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Condition', field_type: 'dropdown' as const,
  options: ['Good', 'Fair', 'Poor'], required: false, sort_order: 2,
};

const dateField = {
  id: 'f4', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Inspection Date', field_type: 'date' as const,
  options: null, required: false, sort_order: 3,
};

describe('DynamicFieldRenderer', () => {
  it('renders a text input for text fields', () => {
    render(<DynamicFieldRenderer fields={[textField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('type', 'text');
  });

  it('renders a number input for number fields', () => {
    render(<DynamicFieldRenderer fields={[numberField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Cost/)).toHaveAttribute('type', 'number');
  });

  it('renders a select for dropdown fields with options', () => {
    render(<DynamicFieldRenderer fields={[dropdownField]} values={{}} onChange={vi.fn()} />);
    const select = screen.getByLabelText('Condition');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
  });

  it('renders a date input for date fields', () => {
    render(<DynamicFieldRenderer fields={[dateField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Inspection Date')).toHaveAttribute('type', 'date');
  });

  it('shows required indicator for required fields', () => {
    render(<DynamicFieldRenderer fields={[numberField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('calls onChange with field id and new value on text input', async () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer fields={[textField]} values={{}} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Notes'), 'hello');
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe('f1');
    expect(lastCall[1]).toBe('hello');
  });

  it('displays existing values', () => {
    render(
      <DynamicFieldRenderer
        fields={[textField, dropdownField]}
        values={{ f1: 'existing note', f3: 'Fair' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Notes')).toHaveValue('existing note');
    expect(screen.getByLabelText('Condition')).toHaveValue('Fair');
  });

  it('renders fields sorted by sort_order', () => {
    const reversed = [dropdownField, textField]; // sort_order 2, 0
    render(<DynamicFieldRenderer fields={reversed} values={{}} onChange={vi.fn()} />);
    const labels = screen.getAllByText(/Notes|Condition/);
    expect(labels[0]).toHaveTextContent('Notes');
    expect(labels[1]).toHaveTextContent('Condition');
  });

  it('renders nothing when fields array is empty', () => {
    const { container } = render(<DynamicFieldRenderer fields={[]} values={{}} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
