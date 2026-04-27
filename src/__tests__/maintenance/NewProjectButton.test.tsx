import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectButton } from '@/components/maintenance/NewProjectButton';

const ONE_PROP = [{ id: 'p1', name: 'Discovery Park', slug: 'discovery-park' }];
const TWO_PROPS = [
  { id: 'p1', name: 'Discovery Park', slug: 'discovery-park' },
  { id: 'p2', name: 'Cedar Loop', slug: 'cedar-loop' },
];

const createHrefBySlug: Record<string, string> = {
  "discovery-park": "/admin/properties/discovery-park/maintenance/new",
  "cedar-loop": "/admin/properties/cedar-loop/maintenance/new",
};

describe('NewProjectButton', () => {
  it('property mode: renders an anchor to the passed createHref', () => {
    render(<NewProjectButton mode="property" properties={ONE_PROP} createHref="/p/discovery-park/admin/maintenance/new" createHrefBySlug={createHrefBySlug} />);
    const link = screen.getByRole('link', { name: /new project/i });
    expect(link).toHaveAttribute('href', '/p/discovery-park/admin/maintenance/new');
  });

  it('org mode + 1 property: renders an anchor to that property\'s create form', () => {
    render(<NewProjectButton mode="org" properties={ONE_PROP} createHrefBySlug={createHrefBySlug} />);
    const link = screen.getByRole('link', { name: /new project/i });
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/new');
  });

  it('org mode + 2 properties: renders a button (no link) that opens a chooser modal', () => {
    render(<NewProjectButton mode="org" properties={TWO_PROPS} createHrefBySlug={createHrefBySlug} />);
    expect(screen.queryByRole('link', { name: /new project/i })).toBeNull();
    const button = screen.getByRole('button', { name: /new project/i });
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Discovery Park')).toBeInTheDocument();
    expect(screen.getByText('Cedar Loop')).toBeInTheDocument();
  });

  it('chooser modal: clicking a property navigates to its create form', () => {
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy, href: originalLocation.href },
    });

    render(<NewProjectButton mode="org" properties={TWO_PROPS} createHrefBySlug={createHrefBySlug} />);
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cedar Loop/i }));
    expect(assignSpy).toHaveBeenCalledWith('/admin/properties/cedar-loop/maintenance/new');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('chooser modal: Escape closes it', () => {
    render(<NewProjectButton mode="org" properties={TWO_PROPS} createHrefBySlug={createHrefBySlug} />);
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing when no active properties exist', () => {
    const { container } = render(<NewProjectButton mode="org" properties={[]} createHrefBySlug={createHrefBySlug} />);
    expect(container.firstChild).toBeNull();
  });
});
