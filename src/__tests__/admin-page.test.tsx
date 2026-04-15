import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPage from '@/app/admin/page';
import { AdminShell } from '@/app/admin/AdminShell';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/admin',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockProperties = [
  { id: 'prop-1', name: 'Elm Street Preserve', slug: 'elm-street', is_active: true, deleted_at: null, created_at: '2026-01-01' },
  { id: 'prop-2', name: 'Downtown Parks', slug: 'downtown', is_active: false, deleted_at: null, created_at: '2026-01-02' },
];

// Result that also acts as a passthrough chain (for .eq() after count select)
const countResult = (n: number) => {
  const r: any = { data: null, count: n, error: null };
  r.eq = () => r;
  r.select = () => r;
  return r;
};

const dataResult = (d: any) => {
  const r: any = { data: d, error: null };
  r.order = () => r;
  r.eq = () => r;
  r.in = () => r;
  r.select = () => r;
  r.single = () => Promise.resolve(r);
  return r;
};

vi.mock('@/app/admin/moderation/actions', () => ({
  getPendingItems: vi.fn(() => Promise.resolve({ items: [] })),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'properties') {
        return {
          select: () => ({
            order: () => ({ data: mockProperties, error: null }),
            eq: () => ({ order: () => ({ data: mockProperties, error: null }) }),
          }),
        };
      }
      if (table === 'org_memberships') {
        return { select: (_c: string, _o?: any) => countResult(5) };
      }
      if (table === 'custom_domains') {
        return { select: (_c: string, _o?: any) => countResult(1) };
      }
      if (table === 'orgs') {
        return dataResult({ name: 'Test Org' });
      }
      if (table === 'items') {
        return { select: () => ({ in: () => ({ data: [], error: null }) }) };
      }
      return dataResult([]);
    },
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AdminShell (mobile layout)', () => {
  const defaultProps = {
    orgId: 'org-1',
    orgSlug: 'test-org',
    propertyId: null,
    propertySlug: null,
    children: <div>content</div>,
  };

  it('renders hamburger button on mobile (md:hidden present)', () => {
    renderWithQuery(<AdminShell {...defaultProps} />);
    const hamburger = screen.getByLabelText('Open menu');
    expect(hamburger).toBeInTheDocument();
    expect(hamburger.className).toContain('md:hidden');
  });

  it('sidebar nav is wrapped in hidden md:block container (hidden on mobile)', () => {
    renderWithQuery(<AdminShell {...defaultProps} />);
    // The nav rendered in the desktop layout should be inside a hidden md:block wrapper
    const nav = screen.getAllByRole('navigation')[0];
    expect(nav.parentElement?.className).toContain('hidden');
    expect(nav.parentElement?.className).toContain('md:block');
  });

  it('sidebar nav is present in the DOM for desktop', () => {
    renderWithQuery(<AdminShell {...defaultProps} />);
    const navElements = screen.getAllByRole('navigation');
    expect(navElements.length).toBeGreaterThan(0);
  });
});

describe('AdminPage (Org Dashboard)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the org dashboard heading', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('renders property list with status badges', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Elm Street Preserve')).toBeInTheDocument();
      expect(screen.getByText('Downtown Parks')).toBeInTheDocument();
    });
  });

  it('navigates to property admin on row click', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText('Elm Street Preserve')).toBeInTheDocument();
    });

    // Click the property row
    const row = screen.getByText('Elm Street Preserve').closest('[class*="cursor-pointer"]')
      || screen.getByText('Elm Street Preserve').parentElement;
    if (row) fireEvent.click(row);

    expect(mockPush).toHaveBeenCalledWith('/admin/properties/elm-street');
  });
});
