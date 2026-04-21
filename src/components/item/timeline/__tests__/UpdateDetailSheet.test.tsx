import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdateDetailSheet from '../UpdateDetailSheet';
import type { TimelineUpdate } from '../timeline-helpers';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span>{String(icon)}</span>,
}));

vi.mock('@/components/ui/PhotoViewer', () => ({
  default: () => <div data-testid="photo-viewer" />,
}));

vi.mock('@/lib/photos', () => ({
  getPhotoUrl: (p: string) => `https://cdn.example.com${p}`,
}));

const baseUpdate = (overrides: Partial<TimelineUpdate> = {}): TimelineUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: '2026-04-17T12:00:00Z',
  created_at: '2026-04-17T12:00:00Z',
  created_by: null,
  anon_name: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Sighting', icon: '🦅' },
  ...overrides,
});

describe('UpdateDetailSheet', () => {
  it('returns nothing when closed', () => {
    const { container } = render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen={false}
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders photo-hero layout when photos exist', () => {
    const u = baseUpdate({
      content: 'some content',
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/a.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('photo-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'photos');
  });

  it('renders content-first layout for long text with no photos', () => {
    const u = baseUpdate({
      content: 'A long content block that definitely exceeds the forty character threshold for content-first.',
    });
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'content');
  });

  it('renders fields-first layout for short content with field values', () => {
    const u = baseUpdate({ content: 'short', custom_field_values: { f1: 'v' } });
    const fields = [{ id: 'f1', update_type_id: 't1', org_id: 'o1', name: 'Field', field_type: 'text' as const, options: null, required: false, sort_order: 1 }];
    render(
      <UpdateDetailSheet
        update={u}
        updateTypeFields={fields}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.getByTestId('layout-variant')).toHaveAttribute('data-variant', 'fields');
  });

  it('hides kebab menu entirely when neither canEdit nor canDelete', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete={false}
      />,
    );
    expect(screen.queryByLabelText('Update actions')).not.toBeInTheDocument();
  });

  it('shows kebab when canDelete is true', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete
        onDelete={() => {}}
      />,
    );
    expect(screen.getByLabelText('Update actions')).toBeInTheDocument();
  });

  it('shows edit menu item only when onEdit is provided', () => {
    const onEdit = vi.fn();
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit
        onEdit={onEdit}
        canDelete={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('hides edit menu item when onEdit is not provided even if canEdit is true', () => {
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit
        canDelete
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onDelete after confirmation', () => {
    const onDelete = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={() => {}}
        canEdit={false}
        canDelete
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Update actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <UpdateDetailSheet
        update={baseUpdate()}
        updateTypeFields={[]}
        isOpen
        onClose={onClose}
        canEdit={false}
        canDelete={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
