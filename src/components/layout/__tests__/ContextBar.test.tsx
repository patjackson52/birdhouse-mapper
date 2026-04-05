import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContextBar } from '../ContextBar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('ContextBar', () => {
  it('renders org name only at org level', () => {
    render(<ContextBar orgName="Audubon Society" orgHref="/org" />);
    expect(screen.getByText('Audubon Society')).toBeDefined();
    expect(screen.queryByText('>')).toBeNull();
  });

  it('renders breadcrumb at property level', () => {
    render(
      <ContextBar
        orgName="Audubon Society"
        orgHref="/org"
        propertyName="Central Park"
        propertyHref="/p/central-park/admin"
      />
    );
    expect(screen.getByText('Audubon Society')).toBeDefined();
    expect(screen.getByText('Central Park')).toBeDefined();
  });

  it('org name is a link when at property level', () => {
    render(
      <ContextBar
        orgName="Audubon Society"
        orgHref="/org"
        propertyName="Central Park"
        propertyHref="/p/central-park/admin"
      />
    );
    const orgLink = screen.getByText('Audubon Society').closest('a');
    expect(orgLink?.getAttribute('href')).toBe('/org');
  });
});
