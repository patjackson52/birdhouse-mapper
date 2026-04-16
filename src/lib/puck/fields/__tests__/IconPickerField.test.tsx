import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPickerField } from '../IconPickerField';

// Mock the shared IconPicker
vi.mock('@/components/shared/IconPicker', () => ({
  IconPicker: ({ value, onChange }: any) => (
    <div data-testid="icon-picker">
      {value ? (
        <>
          <span>{value.name}</span>
          <button aria-label="Clear icon" onClick={() => onChange(undefined)}>Clear</button>
        </>
      ) : (
        <span>No icon</span>
      )}
    </div>
  ),
}));

describe('IconPickerField', () => {
  it('renders "No icon" when value is undefined', () => {
    render(<IconPickerField value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/no icon/i)).toBeDefined();
  });

  it('renders icon name when value is set', () => {
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Bird')).toBeDefined();
  });

  it('delegates clear to onChange(undefined)', () => {
    const onChange = vi.fn();
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
