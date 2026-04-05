// src/components/layout/__tests__/MobileBottomTabs.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileBottomTabs, type TabItem } from '../MobileBottomTabs';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
}));

describe('MobileBottomTabs', () => {
  const tabs: TabItem[] = [
    { href: '/test', label: 'Tab 1', icon: () => <span data-testid="icon-1">1</span> },
    { href: '/other', label: 'Tab 2', icon: () => <span data-testid="icon-2">2</span> },
  ];

  it('renders all tabs with labels', () => {
    render(<MobileBottomTabs tabs={tabs} />);
    expect(screen.getByText('Tab 1')).toBeDefined();
    expect(screen.getByText('Tab 2')).toBeDefined();
  });

  it('marks active tab based on pathname', () => {
    render(<MobileBottomTabs tabs={tabs} />);
    const activeLink = screen.getByText('Tab 1').closest('a');
    expect(activeLink?.className).toContain('text-forest');
  });

  it('is hidden on desktop (md:hidden)', () => {
    const { container } = render(<MobileBottomTabs tabs={tabs} />);
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('md:hidden');
  });
});
