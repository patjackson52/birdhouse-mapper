import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

function makeRow(overrides: Partial<MaintenanceProjectRowData> = {}): MaintenanceProjectRowData {
  return {
    id: 'p-1',
    org_id: 'o-1',
    property_id: 'prop-1',
    title: 'Spring cleaning',
    description: null,
    status: 'in_progress',
    scheduled_for: '2026-04-05',
    created_by: 'u-1',
    updated_by: 'u-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    items_completed: 1,
    items_total: 4,
    knowledge_count: 0,
    creator_name: null,
    ...overrides,
  };
}

describe('MaintenanceProjectRow', () => {
  it('links to the provided detailHref', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow()}
        today="2026-04-10"
        detailHref="/admin/properties/discovery-park/maintenance/p-1"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/p-1');
  });

  it('renders status pill, title, and progress bar for in_progress', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'in_progress', items_completed: 2, items_total: 8 })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText('Spring cleaning')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('shows Overdue chip when scheduled in the past and status is planned', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'planned', scheduled_for: '2026-03-01' })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it('shows "in N days" chip when scheduled within 14 days and status is planned', () => {
    render(
      <MaintenanceProjectRow
        row={makeRow({ status: 'planned', scheduled_for: '2026-04-15' })}
        today="2026-04-10"
        detailHref="/x"
      />,
    );
    expect(screen.getByText(/in 5d/)).toBeInTheDocument();
  });
});
