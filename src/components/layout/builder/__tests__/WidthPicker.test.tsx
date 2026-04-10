import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WidthPicker from '../WidthPicker';

describe('WidthPicker', () => {
  it('renders Full option', () => {
    render(<WidthPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText('Full')).toBeDefined();
  });

  it('highlights full when selected', () => {
    render(<WidthPicker value="full" onChange={vi.fn()} />);
    const fullBtn = screen.getByText('Full');
    expect(fullBtn.className).toContain('bg-forest');
  });

  it('calls onChange with full', () => {
    const onChange = vi.fn();
    render(<WidthPicker value="1/2" onChange={onChange} />);
    fireEvent.click(screen.getByText('Full'));
    expect(onChange).toHaveBeenCalledWith('full');
  });
});
