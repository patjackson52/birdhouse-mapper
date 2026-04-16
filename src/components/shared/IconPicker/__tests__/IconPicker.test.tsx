import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPicker } from '../IconPicker';

// Mock icon catalog
vi.mock('../icon-catalog', () => ({
  searchIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'emoji', name: '🐦', searchTerms: 'bird', category: 'Animals' },
  ]),
  getLucideIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
  ]),
  getHeroicons: vi.fn().mockResolvedValue([
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
  getEmojis: vi.fn().mockReturnValue([
    { set: 'emoji', name: '🐦', searchTerms: 'bird', category: 'Animals' },
  ]),
}));

// Mock IconRenderer
vi.mock('../IconRenderer', () => ({
  IconRenderer: ({ icon }: any) =>
    icon ? <span data-testid="icon-preview">{icon.set === 'emoji' ? icon.name : icon.name}</span> : null,
}));

// Mock emoji-catalog (used by emojiDisplayName helper inside IconPicker)
vi.mock('../emoji-catalog', () => ({
  getAllEmojis: vi.fn().mockReturnValue([
    { emoji: '🐦', name: 'Bird', searchTerms: 'bird', category: 'Animals' },
  ]),
}));

describe('IconPicker', () => {
  it('renders "No icon" when value is undefined', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/no icon/i)).toBeDefined();
  });

  it('shows icon name when value is an emoji', () => {
    render(
      <IconPicker
        value={{ set: 'emoji', name: '🐦' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Bird')).toBeDefined();
  });

  it('opens picker on click', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByPlaceholderText(/search icons/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    render(
      <IconPicker
        value={{ set: 'emoji', name: '🐦' }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows set filter tabs including Emoji', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Lucide')).toBeDefined();
    expect(screen.getByText('Heroicons')).toBeDefined();
    expect(screen.getByText('Emoji')).toBeDefined();
  });
});
