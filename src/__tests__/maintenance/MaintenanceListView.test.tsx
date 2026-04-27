import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
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

const PROP_A = { id: 'prop-1', name: 'Discovery Park', slug: 'discovery-park' };
const PROP_B = { id: 'prop-2', name: 'Cedar Loop', slug: 'cedar-loop' };

const STATS = { in_progress: 1, due_soon: 0, overdue: 0, completed_this_year: 0 };

function detailMap(rows: MaintenanceProjectRowData[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows) m[r.id] = `/admin/properties/${r.property_id}/maintenance/${r.id}`;
  return m;
}
function createMap(props: { slug: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of props) m[p.slug] = `/admin/properties/${p.slug}/maintenance/new`;
  return m;
}

describe('MaintenanceListView', () => {
  it('renders the four stat cards', () => {
    const rows = [makeRow({ status: 'planned', scheduled_for: '2026-04-30' })];
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={properties}
        stats={{ in_progress: 2, due_soon: 1, overdue: 3, completed_this_year: 4 }}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
        createHref="/admin/properties/discovery-park/maintenance/new"
      />,
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Due in 2 weeks')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Completed this year')).toBeInTheDocument();
  });

  it('default Active tab filters to planned + in_progress', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Active project A', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Completed project B', status: 'completed' }),
    ];
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
        createHref="/x"
      />,
    );
    expect(screen.getByText('Active project A')).toBeInTheDocument();
    expect(screen.queryByText('Completed project B')).toBeNull();
  });

  it('clicking the Completed tab swaps the filter', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Active project A', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Completed project B', status: 'completed' }),
    ];
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
        createHref="/x"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Completed/ }));
    expect(screen.getByText('Completed project B')).toBeInTheDocument();
    expect(screen.queryByText('Active project A')).toBeNull();
  });

  it('search input filters by title (case-insensitive substring)', () => {
    const rows = [
      makeRow({ id: 'a', title: 'Spring cleanout', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'Hardware swap', status: 'in_progress' }),
    ];
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
        createHref="/x"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Search projects/i), { target: { value: 'spring' } });
    expect(screen.getByText('Spring cleanout')).toBeInTheDocument();
    expect(screen.queryByText('Hardware swap')).toBeNull();
  });

  it('org mode + single property: flat list, no group header', () => {
    const rows = [makeRow({ status: 'in_progress' })];
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="org"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Discovery Park' })).toBeNull();
  });

  it('org mode + 2 properties: groups by property, header links to property page', () => {
    const rows = [
      makeRow({ id: 'a', title: 'A', property_id: 'prop-1', status: 'in_progress' }),
      makeRow({ id: 'b', title: 'B', property_id: 'prop-2', status: 'in_progress' }),
    ];
    const properties = [PROP_A, PROP_B];
    render(
      <MaintenanceListView
        mode="org"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
      />,
    );
    const aHeader = screen.getByRole('link', { name: 'Discovery Park' });
    expect(aHeader).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance');
    const bHeader = screen.getByRole('link', { name: 'Cedar Loop' });
    expect(bHeader).toHaveAttribute('href', '/admin/properties/cedar-loop/maintenance');
  });

  it('org mode + 2 properties: groups with no projects under the current tab are hidden', () => {
    const rows = [
      makeRow({ id: 'a', title: 'A', property_id: 'prop-1', status: 'in_progress' }),
    ];
    const properties = [PROP_A, PROP_B];
    render(
      <MaintenanceListView
        mode="org"
        rows={rows}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={detailMap(rows)}
        createHrefBySlug={createMap(properties)}
      />,
    );
    expect(screen.getByRole('link', { name: 'Discovery Park' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cedar Loop' })).toBeNull();
  });

  it('org mode + zero properties: shows "Manage properties" link instead of New project CTA', () => {
    render(
      <MaintenanceListView
        mode="org"
        rows={[]}
        properties={[]}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={{}}
        createHrefBySlug={{}}
      />,
    );
    expect(screen.getByText('No active properties yet')).toBeInTheDocument();
    expect(screen.getByText(/Add a property to start planning/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Manage properties/i });
    expect(link).toHaveAttribute('href', '/admin/properties');
    expect(screen.queryByRole('link', { name: /New project/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /New project/i })).toBeNull();
  });

  it('renders empty CTA when zero projects match', () => {
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={[]}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={{}}
        createHrefBySlug={createMap(properties)}
        createHref="/admin/properties/discovery-park/maintenance/new"
      />,
    );
    expect(screen.getByText(/No active projects/i)).toBeInTheDocument();
    const ctas = screen.getAllByRole('link', { name: /New project/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('row links use detailHrefByRowId', () => {
    const row = makeRow({ id: 'p-99', property_id: 'prop-1', status: 'in_progress' });
    const properties = [PROP_A];
    render(
      <MaintenanceListView
        mode="property"
        rows={[row]}
        properties={properties}
        stats={STATS}
        today="2026-04-10"
        detailHrefByRowId={{ 'p-99': '/admin/properties/discovery-park/maintenance/p-99' }}
        createHrefBySlug={createMap(properties)}
        createHref="/x"
      />,
    );
    const link = screen.getByRole('link', { name: /Spring cleaning/i });
    expect(link).toHaveAttribute('href', '/admin/properties/discovery-park/maintenance/p-99');
  });
});
