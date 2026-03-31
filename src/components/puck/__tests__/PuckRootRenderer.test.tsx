import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PuckRootRenderer } from '../PuckRootRenderer';

vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({
    siteName: 'Test Reserve',
    tagline: 'A test site',
    logoUrl: null,
    landingPage: null,
    puckPages: null,
    aboutPageEnabled: true,
    customNavItems: [],
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('PuckRootRenderer', () => {
  it('renders children directly when data is null', () => {
    render(
      <PuckRootRenderer data={null}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
  });

  it('renders children when data has no content', () => {
    const data = { root: { props: {} }, content: [] };
    render(
      <PuckRootRenderer data={data}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
  });

  it('renders header chrome around children when data has header components', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'HeaderBar',
          props: { layout: 'left-aligned', showTagline: false, backgroundColor: 'default' },
        },
      ],
    };
    render(
      <PuckRootRenderer data={data}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
    expect(screen.getByText('Test Reserve')).toBeDefined();
  });

  it('renders footer chrome around children when data has footer components', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'SimpleFooter',
          props: { text: '© 2024 Test Reserve', links: [], showPoweredBy: false },
        },
      ],
    };
    render(
      <PuckRootRenderer data={data}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
    expect(screen.getByText('© 2024 Test Reserve')).toBeDefined();
  });

  it('renders both header and footer chrome around children', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'AnnouncementBar',
          props: { text: 'Announcement!', linkUrl: '', backgroundColor: 'primary' },
        },
        {
          type: 'SimpleFooter',
          props: { text: 'Footer text', links: [], showPoweredBy: false },
        },
      ],
    };
    render(
      <PuckRootRenderer data={data}>
        <div>Page content</div>
      </PuckRootRenderer>
    );
    expect(screen.getByText('Page content')).toBeDefined();
    expect(screen.getByText('Announcement!')).toBeDefined();
    expect(screen.getByText('Footer text')).toBeDefined();
  });
});
