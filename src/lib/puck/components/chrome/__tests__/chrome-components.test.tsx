import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderBar } from '../HeaderBar';
import { SimpleFooter } from '../SimpleFooter';
import { FooterColumns } from '../FooterColumns';
import { SocialLinks } from '../SocialLinks';
import { AnnouncementBar } from '../AnnouncementBar';

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

// HeaderBar
describe('HeaderBar', () => {
  it('renders site name', () => {
    render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="default" />);
    expect(screen.getByText('Test Reserve')).toBeDefined();
  });

  it('shows tagline when showTagline is true', () => {
    render(<HeaderBar layout="left-aligned" showTagline={true} backgroundColor="default" />);
    expect(screen.getByText('A test site')).toBeDefined();
  });

  it('hides tagline when showTagline is false', () => {
    render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="default" />);
    expect(screen.queryByText('A test site')).toBeNull();
  });

  it('applies centered layout class', () => {
    const { container } = render(<HeaderBar layout="centered" showTagline={false} backgroundColor="default" />);
    const inner = container.querySelector('.text-center');
    expect(inner).toBeDefined();
  });
});

// SimpleFooter
describe('SimpleFooter', () => {
  it('renders footer text', () => {
    render(<SimpleFooter text="© 2024 Test Reserve" links={[]} showPoweredBy={false} />);
    expect(screen.getByText('© 2024 Test Reserve')).toBeDefined();
  });

  it('renders links', () => {
    render(
      <SimpleFooter
        text="Footer"
        links={[
          { label: 'Privacy', url: '/privacy' },
          { label: 'Terms', url: '/terms' },
        ]}
        showPoweredBy={false}
      />
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeDefined();
  });

  it('renders powered by when enabled', () => {
    render(<SimpleFooter text="" links={[]} showPoweredBy={true} />);
    expect(screen.getByText('Powered by FieldMapper')).toBeDefined();
  });

  it('does not render powered by when disabled', () => {
    render(<SimpleFooter text="" links={[]} showPoweredBy={false} />);
    expect(screen.queryByText('Powered by FieldMapper')).toBeNull();
  });
});

// FooterColumns
describe('FooterColumns', () => {
  it('renders column titles', () => {
    render(
      <FooterColumns
        columns={[
          { title: 'Explore', links: [{ label: 'Map', url: '/map' }] },
          { title: 'About', links: [{ label: 'Team', url: '/team' }] },
        ]}
        showBranding={false}
        copyrightText=""
      />
    );
    expect(screen.getByText('Explore')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
  });

  it('renders column links', () => {
    render(
      <FooterColumns
        columns={[{ title: 'Links', links: [{ label: 'Map', url: '/map' }, { label: 'List', url: '/list' }] }]}
        showBranding={false}
        copyrightText=""
      />
    );
    expect(screen.getByRole('link', { name: 'Map' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'List' })).toBeDefined();
  });

  it('renders copyright text', () => {
    render(
      <FooterColumns
        columns={[]}
        showBranding={false}
        copyrightText="© 2024 Test Reserve"
      />
    );
    expect(screen.getByText('© 2024 Test Reserve')).toBeDefined();
  });

  it('renders site name when showBranding is true', () => {
    render(
      <FooterColumns
        columns={[]}
        showBranding={true}
        copyrightText=""
      />
    );
    expect(screen.getByText('Test Reserve')).toBeDefined();
  });
});

// SocialLinks
describe('SocialLinks', () => {
  it('renders link elements', () => {
    render(
      <SocialLinks
        links={[
          { platform: 'facebook', url: 'https://facebook.com/test' },
          { platform: 'twitter', url: 'https://twitter.com/test' },
        ]}
        size="medium"
        alignment="center"
      />
    );
    expect(screen.getByRole('link', { name: 'Facebook' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Twitter/X' })).toBeDefined();
  });

  it('renders nothing when links is empty', () => {
    const { container } = render(<SocialLinks links={[]} size="medium" alignment="center" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('links open in new tab', () => {
    render(
      <SocialLinks
        links={[{ platform: 'github', url: 'https://github.com/test' }]}
        size="medium"
        alignment="left"
      />
    );
    const link = screen.getByRole('link', { name: 'GitHub' });
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

// AnnouncementBar
describe('AnnouncementBar', () => {
  it('renders announcement text', () => {
    render(<AnnouncementBar text="New feature available!" linkUrl="" backgroundColor="primary" />);
    expect(screen.getByText('New feature available!')).toBeDefined();
  });

  it('renders as link when linkUrl is provided', () => {
    render(<AnnouncementBar text="Click here" linkUrl="/announcement" backgroundColor="primary" />);
    const link = screen.getByRole('link', { name: 'Click here' });
    expect(link.getAttribute('href')).toBe('/announcement');
  });

  it('renders nothing when text is empty', () => {
    const { container } = render(<AnnouncementBar text="" linkUrl="" backgroundColor="primary" />);
    expect(container.querySelector('div')).toBeNull();
  });

  it('renders dismiss button', () => {
    render(<AnnouncementBar text="Hello" linkUrl="" backgroundColor="accent" />);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
  });
});
