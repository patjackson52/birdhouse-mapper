import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Navigation from '@/components/layout/Navigation';

// Mock next/navigation
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock config
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({
    siteName: 'Test Site',
    tagline: 'Test Tagline',
    landingPage: { enabled: true, blocks: [] },
    customNavItems: [],
  }),
}));

describe('Navigation platform context hiding', () => {
  afterEach(() => {
    // Clear the cookie
    document.cookie = 'x-tenant-source=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    mockPathname = '/';
  });

  it('renders navigation in org context (no platform cookie)', () => {
    mockPathname = '/map';
    const { container } = render(<Navigation />);

    // Should render navigation elements (desktop + mobile = multiple nav elements)
    expect(container.innerHTML).not.toBe('');
    expect(container.querySelector('nav, header')).not.toBeNull();
  });

  it('returns null when x-tenant-source=platform cookie is set', () => {
    document.cookie = 'x-tenant-source=platform; path=/';
    mockPathname = '/';
    const { container } = render(<Navigation />);

    // Should render nothing
    expect(container.innerHTML).toBe('');
  });

  it('renders navigation when cookie has a different value', () => {
    document.cookie = 'x-tenant-source=custom_domain; path=/';
    mockPathname = '/map';
    const { container } = render(<Navigation />);

    expect(container.innerHTML).not.toBe('');
  });

  it('renders navigation on org routes without platform cookie', () => {
    mockPathname = '/map';
    const { container } = render(<Navigation />);

    expect(container.innerHTML).not.toBe('');
    // Check that map link exists (getAllByText since desktop + mobile)
    const mapLinks = screen.getAllByText('Map');
    expect(mapLinks.length).toBeGreaterThan(0);
  });
});
