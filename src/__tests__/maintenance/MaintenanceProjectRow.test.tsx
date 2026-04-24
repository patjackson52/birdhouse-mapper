import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

const today = '2026-04-23';

function makeRow(overrides: Partial<MaintenanceProjectRowData> = {}): MaintenanceProjectRowData {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    org_id: 'o1',
    property_id: 'p1',
    title: 'Spring cleanout',
    description: null,
    status: 'planned',
    scheduled_for: '2026-05-15',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    items_completed: 0,
    items_total: 12,
    knowledge_count: 0,
    creator_name: 'Sarah K.',
    ...overrides,
  };
}

describe('MaintenanceProjectRow', () => {
  it('renders the title and status pill', () => {
    render(<MaintenanceProjectRow row={makeRow()} today={today} propertySlug="park" />);
    expect(screen.getByText('Spring cleanout')).toBeInTheDocument();
    expect(screen.getByLabelText(/Status: Planned/)).toBeInTheDocument();
  });

  it('shows Overdue badge for planned rows in the past', () => {
    const row = makeRow({ scheduled_for: '2026-04-20' });
    render(<MaintenanceProjectRow row={row} today={today} propertySlug="park" />);
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it('does not show Overdue badge for completed rows', () => {
    const row = makeRow({ status: 'completed', scheduled_for: '2026-04-20' });
    render(<MaintenanceProjectRow row={row} today={today} propertySlug="park" />);
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('shows a progress bar only when in progress', () => {
    const inProgress = makeRow({ status: 'in_progress', items_completed: 4, items_total: 12 });
    const { rerender, container } = render(
      <MaintenanceProjectRow row={inProgress} today={today} propertySlug="park" />,
    );
    expect(container.querySelector('[data-testid="progress-bar"]')).not.toBeNull();

    rerender(<MaintenanceProjectRow row={makeRow()} today={today} propertySlug="park" />);
    expect(container.querySelector('[data-testid="progress-bar"]')).toBeNull();
  });
});
