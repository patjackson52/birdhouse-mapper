import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AllUpdatesSheet from '../AllUpdatesSheet';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/lib/photos', () => ({
  getPhotoUrl: (p: string) => `https://cdn.example.com${p}`,
}));

const mkUpdate = (id: string): TimelineUpdate => ({
  id,
  item_id: 'i1',
  update_type_id: 't1',
  content: `update ${id}`,
  update_date: '2026-04-17T00:00:00Z',
  created_at: '2026-04-17T00:00:00Z',
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Note', icon: '📝' },
});

describe('AllUpdatesSheet', () => {
  it('returns nothing when closed', () => {
    const { container } = render(
      <AllUpdatesSheet
        updates={[mkUpdate('a')]}
        updateTypeFields={[]}
        isOpen={false}
        onClose={() => {}}
        onUpdateTap={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders list of updates with count in header', () => {
    render(
      <AllUpdatesSheet
        updates={[mkUpdate('a'), mkUpdate('b'), mkUpdate('c')]}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        onUpdateTap={() => {}}
      />,
    );
    expect(screen.getByText(/All updates \(3\)/)).toBeInTheDocument();
    expect(screen.getByText('update a')).toBeInTheDocument();
    expect(screen.getByText('update b')).toBeInTheDocument();
    expect(screen.getByText('update c')).toBeInTheDocument();
  });

  it('calls onUpdateTap with the tapped update', () => {
    const onUpdateTap = vi.fn();
    const a = mkUpdate('a');
    render(
      <AllUpdatesSheet
        updates={[a]}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        onUpdateTap={onUpdateTap}
      />,
    );
    fireEvent.click(screen.getByText('update a'));
    expect(onUpdateTap).toHaveBeenCalledWith(a);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AllUpdatesSheet
        updates={[mkUpdate('a')]}
        updateTypeFields={[]}
        isOpen
        onClose={onClose}
        onUpdateTap={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
