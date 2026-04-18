import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdateCard from '../UpdateCard';
import type { TimelineUpdate } from '../timeline-helpers';
import type { UpdateTypeField } from '@/lib/types';

vi.mock('@/components/shared/IconPicker', () => ({
  IconRenderer: ({ icon }: { icon: unknown }) => <span data-testid="icon">{String(icon)}</span>,
}));

vi.mock('@/lib/photos', () => ({
  getPhotoUrl: (path: string) => `https://cdn.example.com${path}`,
}));

const baseUpdate = (overrides: Partial<TimelineUpdate> = {}): TimelineUpdate => ({
  id: 'u1',
  item_id: 'i1',
  update_type_id: 't1',
  content: null,
  update_date: new Date().toISOString(),
  created_at: new Date().toISOString(),
  created_by: null,
  org_id: 'o1',
  property_id: 'p1',
  custom_field_values: {},
  update_type: { id: 't1', name: 'Sighting', icon: '🦅' },
  ...overrides,
});

describe('UpdateCard', () => {
  it('renders type name and content preview', () => {
    render(
      <UpdateCard
        update={baseUpdate({ content: 'Saw a red-tailed hawk' })}
        updateTypeFields={[]}
        onTap={() => {}}
      />,
    );
    expect(screen.getByText('Sighting')).toBeInTheDocument();
    expect(screen.getByText('Saw a red-tailed hawk')).toBeInTheDocument();
  });

  it('fires onTap when clicked', () => {
    const onTap = vi.fn();
    render(<UpdateCard update={baseUpdate()} updateTypeFields={[]} onTap={onTap} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('renders photo thumbnail when showPhotos and photos exist', () => {
    const u = baseUpdate({
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/test.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} showPhotos />);
    expect(screen.getByTestId('update-card-thumb')).toBeInTheDocument();
  });

  it('omits photo thumbnail when showPhotos is false', () => {
    const u = baseUpdate({
      photos: [{ id: 'p1', item_id: 'i1', update_id: 'u1', storage_path: '/test.jpg', caption: null, is_primary: true, created_at: '', org_id: 'o1', property_id: 'p1' }],
    });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} showPhotos={false} />);
    expect(screen.queryByTestId('update-card-thumb')).not.toBeInTheDocument();
  });

  it('renders field chips when showFieldValues and fields present', () => {
    const fields: UpdateTypeField[] = [
      { id: 'f1', update_type_id: 't1', org_id: 'o1', name: 'Count', field_type: 'number', options: null, required: false, sort_order: 1 },
    ];
    const u = baseUpdate({ custom_field_values: { f1: 5 } });
    render(<UpdateCard update={u} updateTypeFields={fields} onTap={() => {}} showFieldValues />);
    expect(screen.getByText(/Count/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('falls back to default label/icon for missing update_type', () => {
    const u = baseUpdate({ update_type: undefined });
    render(<UpdateCard update={u} updateTypeFields={[]} onTap={() => {}} />);
    expect(screen.getByText('Update')).toBeInTheDocument();
  });

  it('applies scheduled styling when isScheduled is true', () => {
    const { container } = render(
      <UpdateCard update={baseUpdate()} updateTypeFields={[]} onTap={() => {}} isScheduled />,
    );
    const card = container.querySelector('button');
    expect(card?.className).toMatch(/border-dashed/);
  });

  it('renders entity overflow indicator when more than 3 entities', () => {
    const entityType = { id: 'et1', org_id: 'o1', name: 'Species', icon: { set: 'emoji' as const, name: '🐦' }, color: '#000000', link_to: [], sort_order: 0, api_source: null, created_at: '', updated_at: '' };
    const entities = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      org_id: 'o1',
      entity_type_id: 'et1',
      name: `Entity ${i}`,
      description: null,
      photo_path: null,
      external_link: null,
      external_id: null,
      custom_field_values: {},
      sort_order: i,
      created_at: '',
      updated_at: '',
      entity_type: entityType,
    }));
    render(
      <UpdateCard
        update={baseUpdate({ entities })}
        updateTypeFields={[]}
        onTap={() => {}}
        showEntityChips
      />,
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
