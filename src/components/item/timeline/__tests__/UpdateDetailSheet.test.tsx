import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UpdateDetailSheet } from '../UpdateDetailSheet';
import type { EnrichedUpdate } from '@/lib/types';

function make(overrides: Partial<EnrichedUpdate> = {}): EnrichedUpdate {
  return {
    id: 'u1', item_id: 'i1', update_type_id: 'ut1', content: 'Bluebird fledged!',
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Nest check', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [],
    species: [],
    fields: [],
    createdByProfile: { id: 'user-a', display_name: 'Alice', avatar_url: null, role: 'contributor', update_count: 7 },
    ...overrides,
  };
}

describe('UpdateDetailSheet', () => {
  it('renders nothing when update is null', () => {
    const { container } = render(<UpdateDetailSheet update={null} onClose={() => {}} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders content and attribution', () => {
    render(<UpdateDetailSheet update={make()} onClose={() => {}} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    expect(screen.getByText('Bluebird fledged!')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(<UpdateDetailSheet update={make()} onClose={onClose} onSpeciesOpen={() => {}} canEdit={false} canDelete={false} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('species row click fires onSpeciesOpen with external_id', () => {
    const onSpeciesOpen = vi.fn();
    const update = make({
      species: [{ external_id: 14886, entity_id: 'e1', common_name: 'Eastern Bluebird', photo_url: 'b.png', native: true, cavity_nester: true }],
    });
    render(<UpdateDetailSheet update={update} onClose={() => {}} onSpeciesOpen={onSpeciesOpen} canEdit={false} canDelete={false} onDelete={() => {}} />);
    fireEvent.click(screen.getAllByText('Eastern Bluebird')[0]);
    expect(onSpeciesOpen).toHaveBeenCalledWith(14886);
  });
});
