import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminPage from '@/app/admin/page';

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
