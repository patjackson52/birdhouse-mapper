import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceKnowledgePicker } from '@/components/maintenance/MaintenanceKnowledgePicker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

const addKnowledgeSpy = vi.fn(async (_: unknown) => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  addKnowledgeToProject: (input: unknown) => addKnowledgeSpy(input),
}));

const knowledgeRows = [
  {
    id: 'k-1',
    title: 'Spring Cleaning Protocol',
    excerpt: 'Step-by-step cleaning',
    visibility: 'org',
    tags: ['protocol', 'seasonal'],
    updated_at: '2026-02-14T00:00:00Z',
  },
  {
    id: 'k-2',
    title: 'Identifying Cavity Nesters',
    excerpt: 'Field guide to species',
    visibility: 'public',
    tags: ['field-guide', 'species'],
    updated_at: '2026-01-08T00:00:00Z',
  },
  {
    id: 'k-3',
    title: 'Bird Box Inspection Checklist',
    excerpt: 'Twelve-point inspection',
    visibility: 'org',
    tags: ['checklist'],
    updated_at: '2025-11-30T00:00:00Z',
  },
];

function makeChainable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const resolver = Promise.resolve({ data: rows, error: null });
  for (const k of ['select', 'eq', 'order']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.then = resolver.then.bind(resolver);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => makeChainable(knowledgeRows)),
  }),
}));

describe('MaintenanceKnowledgePicker', () => {
  beforeEach(() => addKnowledgeSpy.mockClear());

  it('renders fetched articles', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    expect(screen.getByText('Identifying Cavity Nesters')).toBeInTheDocument();
    expect(screen.getByText('Bird Box Inspection Checklist')).toBeInTheDocument();
  });

  it('filters out already-linked articles', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={['k-2']}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    expect(screen.queryByText('Identifying Cavity Nesters')).toBeNull();
  });

  it('filters by visibility chip', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Public$/ }));
    expect(screen.getByText('Identifying Cavity Nesters')).toBeInTheDocument();
    expect(screen.queryByText('Spring Cleaning Protocol')).toBeNull();
  });

  it('filters by tag chip', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '#checklist' }));
    expect(screen.getByText('Bird Box Inspection Checklist')).toBeInTheDocument();
    expect(screen.queryByText('Spring Cleaning Protocol')).toBeNull();
  });

  it('has a Create-new link that opens in a new tab', async () => {
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    const link = await screen.findByRole('link', { name: /Create new/i });
    expect(link).toHaveAttribute('href', '/admin/knowledge/new');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('confirms selection with addKnowledgeToProject', async () => {
    const onClose = vi.fn();
    render(
      <MaintenanceKnowledgePicker
        projectId="p-1"
        orgId="o-1"
        alreadyLinkedIds={[]}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Spring Cleaning Protocol'));
    fireEvent.click(screen.getByRole('button', { name: /^Link 1$/ }));
    await waitFor(() => expect(addKnowledgeSpy).toHaveBeenCalledTimes(1));
    expect(addKnowledgeSpy.mock.calls[0][0]).toMatchObject({
      projectId: 'p-1',
      knowledgeIds: ['k-1'],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
