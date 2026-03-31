import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPickerField, COLOR_PRESETS } from '../ColorPickerField';

describe('ColorPickerField', () => {
  it('renders the current color swatch', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorPickerField value="#ff0000" onChange={onChange} label="Link Color" />
    );
    const swatch = container.querySelector('[data-testid="color-swatch"]') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('renders preset swatches', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    const presets = screen.getAllByRole('button', { name: /preset/i });
    expect(presets.length).toBe(COLOR_PRESETS.length);
  });

  it('calls onChange when a preset is clicked', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    const presets = screen.getAllByRole('button', { name: /preset/i });
    fireEvent.click(presets[0]);
    expect(onChange).toHaveBeenCalledWith(COLOR_PRESETS[0].value);
  });

  it('renders a clear button when value is set', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="#ff0000" onChange={onChange} label="Color" />);
    const clear = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('does not render clear button when value is empty', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });
});
