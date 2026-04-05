// src/components/layout/__tests__/PropertyAdminShell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PropertyAdminShell } from '../PropertyAdminShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/p/test-prop/admin',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { name: 'Test Property', org_id: 'org-1' } }),
          order: () => ({ then: (cb: any) => cb({ data: [] }) }),
        }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('PropertyAdminShell', () => {
  it('renders property admin sidebar items', () => {
    render(
      <PropertyAdminShell
        orgId="org-1"
        orgSlug="test-org"
        propertySlug="test-prop"
        userEmail="test@example.com"
      >
        <div>Content</div>
      </PropertyAdminShell>
    );
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Data')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
  });

  it('includes back-to-org link', () => {
    render(
      <PropertyAdminShell
        orgId="org-1"
        orgSlug="test-org"
        propertySlug="test-prop"
        userEmail="test@example.com"
      >
        <div>Content</div>
      </PropertyAdminShell>
    );
    const backLink = screen.getByText(/Back to/);
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/org');
  });
});
