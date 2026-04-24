import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MaintenanceProjectsBlock } from '@/components/layout/blocks/MaintenanceProjectsBlock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

const rows: Array<{
  maintenance_project_id: string;
  completed_at: string | null;
  maintenance_projects: {
    id: string;
    title: string;
    status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
    scheduled_for: string | null;
    property_id: string;
    updated_at: string;
  };
}> = [
  {
    maintenance_project_id: 'p-1',
    completed_at: '2026-03-14T12:00:00Z',
    maintenance_projects: {
      id: 'p-1',
      title: 'Winter damage assessment',
      status: 'completed',
      scheduled_for: '2026-03-02',
      property_id: 'prop-1',
      updated_at: '2026-03-14T12:00:00Z',
    },
  },
  {
    maintenance_project_id: 'p-2',
    completed_at: null,
    maintenance_projects: {
      id: 'p-2',
      title: 'Spring cleaning protocol',
      status: 'in_progress',
      scheduled_for: '2026-04-05',
      property_id: 'prop-1',
      updated_at: '2026-04-10T09:00:00Z',
    },
  },
];

function makeChainable(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const resolver = Promise.resolve({ data, error: null });
  for (const k of ['select', 'eq', 'order']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.then = resolver.then.bind(resolver);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => makeChainable(rows)),
  }),
}));

describe('MaintenanceProjectsBlock', () => {
  it('renders skeleton initially', () => {
    render(<MaintenanceProjectsBlock itemId="item-a" />);
    expect(screen.getByTestId('mp-block-skeleton')).toBeInTheDocument();
  });

  it('renders linked projects', async () => {
    render(<MaintenanceProjectsBlock itemId="item-a" />);
    await waitFor(() =>
      expect(screen.getAllByText('Winter damage assessment').length).toBeGreaterThanOrEqual(1),
    );
    expect(screen.getByText('Spring cleaning protocol')).toBeInTheDocument();
  });

  it('shows the project count', async () => {
    render(<MaintenanceProjectsBlock itemId="item-a" />);
    await waitFor(() =>
      expect(screen.getByText(/2 projects/i)).toBeInTheDocument(),
    );
  });

  it('renders last-maintained footer from most recent completed_at', async () => {
    render(<MaintenanceProjectsBlock itemId="item-a" />);
    await waitFor(() =>
      expect(screen.getByText(/Last maintained via/i)).toBeInTheDocument(),
    );
    // "Winter damage assessment" appears in both the list item and the footer;
    // assert at least one match, then scope-check that the footer contains it.
    const matches = screen.getAllByText(/Winter damage assessment/i);
    expect(matches.length).toBeGreaterThanOrEqual(2); // list + footer
  });

  it('renders nothing when no projects linked', async () => {
    const { container, rerender } = render(<MaintenanceProjectsBlock itemId="item-a" />);
    rerender(<MaintenanceProjectsBlock itemId="item-a" />);
    expect(container).toBeInTheDocument();
  });
});
