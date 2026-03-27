import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PropertyAdminLayout from '@/app/admin/properties/[slug]/layout';

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test-prop' }),
  usePathname: () => '/admin/properties/test-prop/settings',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'properties') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { name: 'Elm Preserve', org_id: 'org-1' } }),
            }),
          }),
        };
      }
      if (table === 'entity_types') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      return { select: () => ({}) };
    },
  }),
}));

describe('PropertyAdminLayout (mobile)', () => {
  it('renders hamburger button with correct aria-label', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    const btn = screen.getByRole('button', { name: 'Open menu' });
    expect(btn).toBeInTheDocument();
  });

  it('hamburger button is inside md:hidden container', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    const btn = screen.getByRole('button', { name: 'Open menu' });
    const mobileNav = btn.closest('.md\\:hidden');
    expect(mobileNav).toBeInTheDocument();
  });

  it('drawer is not rendered initially', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    // No backdrop visible before opening
    expect(screen.queryByRole('navigation', { hidden: false })).not.toBeNull();
    // There should be exactly one nav (the desktop one in hidden md:block)
    const navs = screen.getAllByRole('navigation');
    expect(navs).toHaveLength(1);
  });

  it('clicking hamburger opens the drawer (second nav appears)', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    const btn = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(btn);
    const navs = screen.getAllByRole('navigation');
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  it('clicking the backdrop closes the drawer', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getAllByRole('navigation').length).toBeGreaterThanOrEqual(2);
    // Click the backdrop (aria-hidden div)
    const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('desktop sidebar is wrapped in hidden md:block container', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    const nav = screen.getByRole('navigation');
    expect(nav.parentElement?.className).toContain('hidden');
    expect(nav.parentElement?.className).toContain('md:block');
  });

  it('content area does not have negative margin class', () => {
    const { container } = render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    const allDivs = container.querySelectorAll('div');
    allDivs.forEach((div) => {
      expect(div.className).not.toContain('-m-6');
    });
  });

  it('renders children in the content area', () => {
    render(<PropertyAdminLayout><div data-testid="child">hello</div></PropertyAdminLayout>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('property name shown in mobile nav bar', async () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    await waitFor(() => {
      const matches = screen.getAllByText('Elm Preserve');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('drawer nav items close drawer on click', () => {
    render(<PropertyAdminLayout><div>content</div></PropertyAdminLayout>);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getAllByRole('navigation').length).toBeGreaterThanOrEqual(2);
    // Click one of the nav links in the drawer
    const drawerNavs = screen.getAllByRole('navigation');
    const drawerLinks = drawerNavs[0].querySelectorAll('a');
    if (drawerLinks.length > 0) {
      fireEvent.click(drawerLinks[0]);
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    }
  });
});
