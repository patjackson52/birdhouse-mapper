// src/components/knowledge/__tests__/KnowledgePicker.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockItems = [
  {
    id: 'k1',
    org_id: 'org-1',
    title: 'How to Clean Birdhouses',
    slug: 'how-to-clean-birdhouses-abc1',
    body: null,
    body_html: '<p>Step 1</p>',
    excerpt: 'Step-by-step guide for seasonal maintenance.',
    cover_image_url: 'https://example.com/cover.jpg',
    tags: ['maintenance', 'howto'],
    visibility: 'org' as const,
    is_ai_context: true,
    ai_priority: null,
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'k2',
    org_id: 'org-1',
    title: 'BirdBox Plans',
    slug: 'birdbox-plans-def2',
    body: null,
    body_html: '<p>Dimensions</p>',
    excerpt: 'Construction plans and specifications.',
    cover_image_url: null,
    tags: ['plans'],
    visibility: 'public' as const,
    is_ai_context: true,
    ai_priority: 1,
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

vi.mock('@/lib/knowledge/actions', () => ({
  getKnowledgeItems: vi.fn(() => Promise.resolve({ items: mockItems, error: null })),
}));

import KnowledgePicker from '../KnowledgePicker';

describe('KnowledgePicker', () => {
  it('renders with header and close button', () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Select Knowledge Article')).toBeTruthy();
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('displays knowledge items after loading', async () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
      expect(screen.getByText('BirdBox Plans')).toBeTruthy();
    });
  });

  it('shows excerpts for items', async () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Step-by-step guide for seasonal maintenance.')).toBeTruthy();
    });
  });

  it('renders tag filter pills from loaded items', async () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      // Tag filter pills are rendered as buttons; getAllByText ensures at least one match
      expect(screen.getAllByText('maintenance').length).toBeGreaterThan(0);
      expect(screen.getAllByText('howto').length).toBeGreaterThan(0);
      expect(screen.getAllByText('plans').length).toBeGreaterThan(0);
    });
  });

  it('has a search input', () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search articles…')).toBeTruthy();
  });

  it('select button is disabled when nothing is selected', async () => {
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    });
    const selectBtn = screen.getByText('Select');
    expect(selectBtn).toHaveAttribute('disabled');
  });

  it('calls onSelect with the selected item when Select is clicked', async () => {
    const onSelect = vi.fn();
    render(<KnowledgePicker orgId="org-1" onSelect={onSelect} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    });
    // Click the first item
    fireEvent.click(screen.getByText('How to Clean Birdhouses'));
    // Click Select button (use role to avoid matching "Select Knowledge Article" header)
    fireEvent.click(screen.getByRole('button', { name: /^Select/ }));
    expect(onSelect).toHaveBeenCalledWith([mockItems[0]]);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    render(<KnowledgePicker orgId="org-1" onSelect={vi.fn()} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('How to Clean Birdhouses')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
