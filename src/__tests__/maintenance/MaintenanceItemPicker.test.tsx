import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceItemPicker } from '@/components/maintenance/MaintenanceItemPicker';

// Mock next/navigation — pickers call router.refresh() after successful add.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

// Mock server actions
const addItemsSpy = vi.fn(async (_: unknown) => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  addItemsToProject: (input: unknown) => addItemsSpy(input),
}));

// Mock the Supabase client. The picker runs two queries in sequence:
//   1) from('items').select(...).eq('property_id', …).order('name')
//   2) from('item_updates').select(...).in('item_id', [...]).eq('update_types.name', 'Maintenance').order(...)
const itemsRows = [
  { id: 'item-a', name: 'Alpha Box', latitude: 10, longitude: 20, item_type_id: 't1', item_types: { name: 'Bird Box', icon: '🐦' } },
  { id: 'item-b', name: 'Beta Box', latitude: 11, longitude: 21, item_type_id: 't1', item_types: { name: 'Bird Box', icon: '🐦' } },
  { id: 'item-c', name: 'Charlie Marker', latitude: 12, longitude: 22, item_type_id: 't2', item_types: { name: 'Trail Marker', icon: '📍' } },
];

const updatesRows = [
  // Alpha: 3 months ago → normal tone
  { item_id: 'item-a', created_at: '2026-01-20T00:00:00Z', update_types: { name: 'Maintenance' } },
  // Beta: 2 years ago → danger tone
  { item_id: 'item-b', created_at: '2024-03-01T00:00:00Z', update_types: { name: 'Maintenance' } },
  // Charlie: never — no row
];

function makeChainable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const resolver = Promise.resolve({ data: rows, error: null });
  for (const k of ['select', 'eq', 'in', 'order']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  chain.then = resolver.then.bind(resolver);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'items') return makeChainable(itemsRows);
      if (table === 'item_updates') return makeChainable(updatesRows);
      return makeChainable([]);
    }),
  }),
}));

describe('MaintenanceItemPicker', () => {
  beforeEach(() => addItemsSpy.mockClear());

  it('renders loading then the fetched items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.getByText('Beta Box')).toBeInTheDocument();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('filters out already-linked items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={['item-b']}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.queryByText('Beta Box')).toBeNull();
  });

  it('filters by search query', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: 'Alpha' } });
    expect(screen.getByText('Alpha Box')).toBeInTheDocument();
    expect(screen.queryByText('Beta Box')).toBeNull();
  });

  it('toggles type filter chips', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    // Click "Bird Box" chip to DESELECT → only non-bird-box items remain
    const chip = screen.getByRole('button', { name: /^Bird Box$/ });
    fireEvent.click(chip);
    expect(screen.queryByText('Alpha Box')).toBeNull();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('filters by last-maintained "1 yr+" chip', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Not in 1 yr\+/ }));
    // Beta (2 yr ago) and Charlie (never) qualify. Alpha (3 mo ago) does not.
    expect(screen.queryByText('Alpha Box')).toBeNull();
    expect(screen.getByText('Beta Box')).toBeInTheDocument();
    expect(screen.getByText('Charlie Marker')).toBeInTheDocument();
  });

  it('select-all toggles all visible items', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/select all visible/i));
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it('submit button disabled with 0 selected', async () => {
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Add items$/ })).toBeDisabled();
  });

  it('confirms selection with addItemsToProject', async () => {
    const onClose = vi.fn();
    render(
      <MaintenanceItemPicker
        projectId="p-1"
        propertyId="prop-1"
        alreadyLinkedIds={[]}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(screen.getByText('Alpha Box')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alpha Box'));
    fireEvent.click(screen.getByRole('button', { name: /^Add 1 item$/ }));
    await waitFor(() => expect(addItemsSpy).toHaveBeenCalledTimes(1));
    expect(addItemsSpy.mock.calls[0][0]).toMatchObject({
      projectId: 'p-1',
      itemIds: ['item-a'],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
