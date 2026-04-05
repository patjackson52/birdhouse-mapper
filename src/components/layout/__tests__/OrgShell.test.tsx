import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrgShell } from '../OrgShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/org',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { name: 'Test Org' } }),
        }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('OrgShell', () => {
  it('renders sidebar with org nav items', () => {
    render(
      <OrgShell orgId="org-1" orgSlug="test-org" userEmail="test@example.com">
        <div>Content</div>
      </OrgShell>
    );
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Properties')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
    expect(screen.getByText('Item Types')).toBeDefined();
    expect(screen.getByText('Entity Types')).toBeDefined();
  });

  it('renders children in main area', () => {
    render(
      <OrgShell orgId="org-1" orgSlug="test-org" userEmail="test@example.com">
        <div>Test Content</div>
      </OrgShell>
    );
    expect(screen.getByText('Test Content')).toBeDefined();
  });
});
