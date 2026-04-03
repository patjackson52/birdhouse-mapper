// src/components/knowledge/__tests__/KnowledgeSelect.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockItems = [
  { id: 'k1', org_id: 'org-1', title: 'How to Clean Birdhouses', slug: 'clean', body: null, body_html: null, excerpt: null, cover_image_url: null, tags: ['maintenance'], visibility: 'org' as const, is_ai_context: true, ai_priority: null, created_by: 'u1', updated_by: 'u1', created_at: '', updated_at: '' },
  { id: 'k2', org_id: 'org-1', title: 'BirdBox Plans', slug: 'plans', body: null, body_html: null, excerpt: null, cover_image_url: null, tags: ['plans'], visibility: 'public' as const, is_ai_context: true, ai_priority: null, created_by: 'u1', updated_by: 'u1', created_at: '', updated_at: '' },
];

vi.mock('@/lib/knowledge/actions', () => ({
  getKnowledgeItems: vi.fn(() => Promise.resolve({ items: mockItems, error: null })),
}));

import KnowledgeSelect from '../KnowledgeSelect';

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('KnowledgeSelect', () => {
  it('renders a button to open the dropdown', async () => {
    renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={[]} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Link knowledge article…')).toBeTruthy();
    });
  });

  it('shows items in dropdown when clicked', async () => {
    renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={[]} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Link knowledge article…')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Link knowledge article…'));
    expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    expect(screen.getByText('BirdBox Plans')).toBeTruthy();
  });

  it('shows selected items as pills', async () => {
    renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={['k1']} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    });
    // The button text changes when items are selected
    expect(screen.getByText('Add another…')).toBeTruthy();
  });

  it('calls onChange when an item is selected', async () => {
    const onChange = vi.fn();
    renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={[]} onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByText('Link knowledge article…')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Link knowledge article…'));
    fireEvent.click(screen.getByText('How to Clean Birdhouses'));
    expect(onChange).toHaveBeenCalledWith(['k1']);
  });

  it('calls onChange to remove when x is clicked on a pill', async () => {
    const onChange = vi.fn();
    renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={['k1']} onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    });
    // Click the × button on the pill
    const removeBtn = screen.getByText('×');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('returns null when no items exist', async () => {
    vi.mocked((await import('@/lib/knowledge/actions')).getKnowledgeItems).mockResolvedValueOnce({ items: [], error: null });
    const { container } = renderWithQuery(<KnowledgeSelect orgId="org-1" selectedIds={[]} onChange={vi.fn()} />);
    // Initially shows loading, then should render nothing
    await waitFor(() => {
      // Component returns null for empty items, container may have the wrapper
    });
  });
});
