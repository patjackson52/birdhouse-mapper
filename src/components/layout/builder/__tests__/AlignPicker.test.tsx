import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AlignPicker from '../AlignPicker';

describe('AlignPicker', () => {
  it('renders three alignment buttons', () => {
    render(<AlignPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /left/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /center/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /right/i })).toBeDefined();
  });

  it('highlights the active alignment', () => {
    render(<AlignPicker value="center" onChange={vi.fn()} />);
    const centerBtn = screen.getByRole('button', { name: /center/i });
    expect(centerBtn.className).toContain('bg-forest');
  });

  it('defaults visual highlight to start when value is undefined', () => {
    render(<AlignPicker value={undefined} onChange={vi.fn()} />);
    const leftBtn = screen.getByRole('button', { name: /left/i });
    expect(leftBtn.className).toContain('bg-forest');
  });

  it('calls onChange with the selected alignment', () => {
    const onChange = vi.fn();
    render(<AlignPicker value="start" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /right/i }));
    expect(onChange).toHaveBeenCalledWith('end');
  });
});
