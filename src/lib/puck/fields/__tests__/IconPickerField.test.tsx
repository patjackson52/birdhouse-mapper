import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPickerField } from '../IconPickerField';

// Mock icon catalog
vi.mock('../../icons/icon-catalog', () => ({
  searchIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'lucide', name: 'MapPin', searchTerms: 'map pin' },
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
  getLucideIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'lucide', name: 'MapPin', searchTerms: 'map pin' },
  ]),
  getHeroicons: vi.fn().mockResolvedValue([
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
}));

// Mock IconRenderer
vi.mock('../../icons/IconRenderer', () => ({
  IconRenderer: ({ icon }: any) => icon ? <span data-testid="icon-preview">{icon.name}</span> : null,
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
    expect(screen.getAllByText('Bird').length).toBeGreaterThan(0);
  });

  it('opens picker on click', () => {
    render(<IconPickerField value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByPlaceholderText(/search icons/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
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
