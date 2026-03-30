import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

describe('AdminSidebar', () => {
  it('renders section headers as non-clickable labels', () => {
    const items = [
      { label: 'Dashboard', href: '/admin' },
      { type: 'section' as const, label: 'Data' },
      { label: 'AI Context', href: '/admin/ai-context' },
      { label: 'Geo Layers', href: '/admin/geo-layers' },
    ];

    render(<AdminSidebar title="Test Org" items={items} />);

    // Section header renders as text, not a link
    const sectionHeader = screen.getByText('Data');
    expect(sectionHeader.tagName).not.toBe('A');
    expect(sectionHeader.closest('a')).toBeNull();

    // Nav items render as links
    expect(screen.getByText('AI Context').closest('a')).toBeTruthy();
    expect(screen.getByText('Geo Layers').closest('a')).toBeTruthy();
  });
});
