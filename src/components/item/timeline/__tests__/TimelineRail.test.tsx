import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimelineRail } from '../TimelineRail';
import type { EnrichedUpdate } from '@/lib/types';

function make(i: number): EnrichedUpdate {
  return {
    id: `u${i}`, item_id: 'i1', update_type_id: 'ut1', content: `update ${i}`,
    update_date: '2026-04-19T10:00:00Z', created_at: '2026-04-19T10:00:00Z',
    created_by: 'user-a', org_id: 'o1', property_id: 'p1',
    custom_field_values: {}, anon_name: null,
    update_type: { id: 'ut1', org_id: 'o1', name: 'Type', icon: '🐣', is_global: true, item_type_id: null, sort_order: 0, min_role_create: null, min_role_edit: null, min_role_delete: null },
    photos: [], species: [], fields: [],
    createdByProfile: { id: 'user-a', display_name: 'A', avatar_url: null, role: 'contributor', update_count: 1 },
  };
}

describe('TimelineRail', () => {
  it('renders all updates when under cap', () => {
    const updates = [make(1), make(2), make(3)];
    render(<TimelineRail updates={updates} maxItems={10} canAddUpdate={false} onDeleteUpdate={() => {}} />);
    expect(screen.getByText('update 1')).toBeInTheDocument();
    expect(screen.getByText('update 3')).toBeInTheDocument();
    expect(screen.queryByText(/View all/i)).toBeNull();
  });

  it('caps at maxItems and shows View all', () => {
    const updates = [make(1), make(2), make(3), make(4)];
    render(<TimelineRail updates={updates} maxItems={2} canAddUpdate={false} onDeleteUpdate={() => {}} />);
    expect(screen.getByText('update 1')).toBeInTheDocument();
    expect(screen.getByText('update 2')).toBeInTheDocument();
    expect(screen.queryByText('update 3')).toBeNull();
    expect(screen.getByRole('button', { name: /view all/i })).toBeInTheDocument();
  });
});
