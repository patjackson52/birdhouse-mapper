import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceListClient } from '@/app/admin/properties/[slug]/maintenance/MaintenanceListClient';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

const today = '2026-04-23';

function makeRow(
  id: string,
  overrides: Partial<MaintenanceProjectRowData> = {},
): MaintenanceProjectRowData {
  return {
    id,
    org_id: 'o1',
    property_id: 'p1',
    title: `Project ${id}`,
    description: null,
    status: 'planned',
    scheduled_for: '2026-06-01',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    items_completed: 0,
    items_total: 1,
    knowledge_count: 0,
    creator_name: 'Sarah',
    ...overrides,
  };
}

describe('MaintenanceListClient', () => {
  const rows: MaintenanceProjectRowData[] = [
    makeRow('a1', { status: 'planned', title: 'Alpha' }),
    makeRow('a2', { status: 'in_progress', title: 'Beta' }),
    makeRow('a3', { status: 'completed', title: 'Gamma' }),
    makeRow('a4', { status: 'cancelled', title: 'Delta' }),
  ];

  it('defaults to Active tab, showing planned + in_progress', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.queryByText('Delta')).toBeNull();
  });

  it('switches to Completed tab', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('search narrows to matching titles within the current tab', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.change(screen.getByPlaceholderText(/Search projects/), { target: { value: 'Alp' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('shows "No matches" when filter yields nothing', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.change(screen.getByPlaceholderText(/Search projects/), { target: { value: 'zzz' } });
    expect(screen.getByText(/No matches/i)).toBeInTheDocument();
  });
});
