import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Navigation from '@/components/layout/Navigation';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

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

// Mock Supabase client — control auth state per test
let mockUser: any = null;
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockUser }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

describe('Navigation', () => {
  afterEach(() => {
    document.cookie = 'x-tenant-source=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    mockPathname = '/';
    mockUser = null;
  });

  describe('platform context hiding', () => {
    it('renders navigation in org context (no platform cookie)', () => {
      mockPathname = '/map';
      const { container } = renderWithQueryClient(<Navigation />);

      expect(container.innerHTML).not.toBe('');
      expect(container.querySelector('nav, header')).not.toBeNull();
    });

    it('returns null when x-tenant-source=platform cookie is set', () => {
      document.cookie = 'x-tenant-source=platform; path=/';
      mockPathname = '/';
      const { container } = renderWithQueryClient(<Navigation />);

      expect(container.innerHTML).toBe('');
    });

    it('renders navigation when cookie has a different value', () => {
      document.cookie = 'x-tenant-source=custom_domain; path=/';
      mockPathname = '/map';
      const { container } = renderWithQueryClient(<Navigation />);

      expect(container.innerHTML).not.toBe('');
    });

    it('renders navigation on org routes without platform cookie', () => {
      mockPathname = '/map';
      const { container } = renderWithQueryClient(<Navigation />);

      expect(container.innerHTML).not.toBe('');
      const mapLinks = screen.getAllByText('Map');
      expect(mapLinks.length).toBeGreaterThan(0);
    });
  });

  describe('auth-gated nav items', () => {
    it('hides Manage and Settings when not authenticated', async () => {
      mockUser = null;
      mockPathname = '/map';
      renderWithQueryClient(<Navigation />);

      // Wait for auth check to resolve
      await waitFor(() => {
        expect(screen.queryByText('Manage')).toBeNull();
      });
      expect(screen.queryByTitle('Site Settings')).toBeNull();
    });

    it('shows Manage and Settings when authenticated', async () => {
      mockUser = { id: 'user-1', email: 'test@test.com' };
      mockPathname = '/map';
      renderWithQueryClient(<Navigation isAuthenticated={true} />);

      await waitFor(() => {
        // Desktop nav has text "Manage", mobile has "Manage" too
        expect(screen.getAllByText('Manage').length).toBeGreaterThan(0);
      });
    });
  });
});
