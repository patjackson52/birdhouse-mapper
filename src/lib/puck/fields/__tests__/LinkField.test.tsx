import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkField } from '../LinkField';
import { PuckSuggestionsProvider } from '../PuckSuggestionsProvider';

// Mock ColorPickerField
vi.mock('../ColorPickerField', () => ({
  ColorPickerField: ({ value, onChange, label }: any) => (
    <div data-testid="color-picker">
      <span>{label}</span>
      <button onClick={() => onChange('#ff0000')}>set-color</button>
    </div>
  ),
}));

vi.mock('../link-suggestions', async () => {
  const actual = await vi.importActual('../link-suggestions');
  return {
    ...actual,
    PUBLIC_ROUTES: [
      { href: '/', label: 'Home' },
      { href: '/map', label: 'Map' },
      { href: '/about', label: 'About' },
    ],
  };
});

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

describe('combobox', () => {
  it('opens dropdown on focus showing page suggestions', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Map')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
  });

  it('closes dropdown on Escape', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters suggestions by typing', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ma' } });
    expect(screen.getByText('Map')).toBeDefined();
    expect(screen.queryByText('About')).toBeNull();
  });

  it('selects a suggestion on click and closes dropdown', async () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Map'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/map' })
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects suggestion with Enter key', async () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/' })
    );
  });

  it('auto-sets target _blank for external URL suggestions', async () => {
    const puckData = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'c1', linkHref: 'https://example.com' },
        },
      ],
    };
    const onChange = vi.fn();
    render(
      <PuckSuggestionsProvider data={puckData}>
        <LinkField value="" onChange={onChange} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('example.com'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.com', target: '_blank' })
    );
  });

  it('shows only pages group when no provider', async () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.queryByText('Previously Used')).toBeNull();
  });

  it('shows Previously Used group when provider has external links', async () => {
    const puckData = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'c1', linkHref: 'https://example.com' },
        },
      ],
    };
    render(
      <PuckSuggestionsProvider data={puckData}>
        <LinkField value="" onChange={vi.fn()} />
      </PuckSuggestionsProvider>
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.getByText('Previously Used')).toBeDefined();
  });
});
