import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkField } from '../LinkField';

// Mock ColorPickerField
vi.mock('../ColorPickerField', () => ({
  ColorPickerField: ({ value, onChange, label }: any) => (
    <div data-testid="color-picker">
      <span>{label}</span>
      <button onClick={() => onChange('#ff0000')}>set-color</button>
    </div>
  ),
}));

describe('LinkField', () => {
  it('renders href when value is a string', () => {
    render(<LinkField value="/about" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('/about')).toBeDefined();
  });

  it('renders href when value is a LinkValue object', () => {
    render(
      <LinkField value={{ href: '/contact', target: '_blank', color: '#ff0000' }} onChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue('/contact')).toBeDefined();
  });

  it('renders placeholder when value is empty', () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/url/i)).toBeDefined();
  });

  it('calls onChange with LinkValue when href changes', () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/url/i);
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.com' })
    );
  });

  it('shows target toggle', () => {
    render(<LinkField value={{ href: '/about' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/new tab/i)).toBeDefined();
  });

  it('shows color picker', () => {
    render(<LinkField value={{ href: '/about' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('color-picker')).toBeDefined();
  });
});
