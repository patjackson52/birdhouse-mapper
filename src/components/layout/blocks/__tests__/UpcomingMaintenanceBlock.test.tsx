import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingMaintenanceBlock } from '../UpcomingMaintenanceBlock';

// --- Supabase client mock ---
// The block runs ONE query:
//   from('maintenance_project_items')
//     .select('completed_at, maintenance_projects(id, title, description, status, scheduled_for, updated_at)')
//     .eq('item_id', itemId)
// We mock the chain to resolve with a controllable result per test.

let supabaseResult: { data: unknown; error: { message: string } | null } = {
  data: [],
  error: null,
};

function makeChainable() {
  const chain: Record<string, unknown> = {};
  const resolver = () => Promise.resolve(supabaseResult);
  for (const k of ['select', 'eq']) {
    chain[k] = vi.fn(() => chain as unknown as typeof chain);
  }
  (chain as { then: typeof Promise.prototype.then }).then = ((onFulfilled: unknown, onRejected: unknown) =>
    resolver().then(onFulfilled as never, onRejected as never)) as typeof Promise.prototype.then;
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => makeChainable()),
  }),
}));

// --- Time mock ---
// Tests against a fixed "today" so date math is deterministic.
const TODAY = new Date('2026-04-27T12:00:00Z');

beforeEach(() => {
  // Only fake the Date — leave setTimeout/setInterval real so findByText polling works.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  supabaseResult = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Fixture builder ---
type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
function row(opts: {
  id: string;
  title: string;
  description?: string | null;
  status: ProjectStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  updated_at?: string;
}) {
  return {
    completed_at: opts.completed_at,
    maintenance_projects: {
      id: opts.id,
      title: opts.title,
      description: opts.description ?? null,
      status: opts.status,
      scheduled_for: opts.scheduled_for,
      updated_at: opts.updated_at ?? '2026-04-20T00:00:00Z',
    },
  };
}

describe('UpcomingMaintenanceBlock', () => {
  it('renders the loading skeleton before data arrives', () => {
    // Supabase resolves on next microtask; the first synchronous render shows the skeleton.
    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );
    expect(screen.getByTestId('mp-block-skeleton')).toBeInTheDocument();
  });

  it('renders the mixed state (overdue + upcoming + unscheduled + footer)', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-overdue',
          title: 'Spring nestbox inspection',
          description: 'Annual check for damage, mites, and replace nesting material.',
          status: 'planned',
          scheduled_for: '2026-04-24',
          completed_at: null,
        }),
        row({
          id: 'p-upcoming-1',
          title: 'Predator guard install',
          description: 'Install metal cone guards on poles.',
          status: 'in_progress',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
        row({
          id: 'p-upcoming-2',
          title: 'Annual cleanout',
          description: null,
          status: 'planned',
          scheduled_for: '2026-09-15',
          completed_at: null,
        }),
        row({
          id: 'p-unscheduled',
          title: 'Replace warped roof panel',
          description: 'Reported by volunteer.',
          status: 'planned',
          scheduled_for: null,
          completed_at: null,
        }),
        row({
          id: 'p-done',
          title: 'Winter weatherproofing',
          status: 'completed',
          scheduled_for: '2026-02-15',
          completed_at: '2026-02-18T10:00:00Z',
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.queryByText(/\d+ upcoming/)).not.toBeInTheDocument();

    expect(screen.getByText('Overdue')).toBeInTheDocument();
    // The "Upcoming" subgroup label is intentionally suppressed — the card header already says it.
    expect(screen.queryByText('Upcoming', { selector: 'div' })).not.toBeInTheDocument();
    expect(screen.getByText('Unscheduled')).toBeInTheDocument();

    expect(screen.getByText('3d late')).toBeInTheDocument();
    expect(screen.getByText(/May 2/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 15/)).toBeInTheDocument();

    const overdueLink = screen.getByText('Spring nestbox inspection').closest('a');
    expect(overdueLink).not.toBeNull();
    expect(overdueLink?.getAttribute('href')).toBe('/p/property-a/maintenance/p-overdue');

    const desc = screen.getByText(/Annual check for damage/i);
    expect(desc.className).toMatch(/line-clamp-1/);

    expect(screen.getByText(/Last maintained via/)).toBeInTheDocument();
    expect(screen.getByText('Winter weatherproofing')).toBeInTheDocument();
  });

  it('renders the caught-up empty state when there are no upcoming but a completed exists', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-done',
          title: 'Winter weatherproofing',
          status: 'completed',
          scheduled_for: '2026-02-15',
          completed_at: '2026-02-18T10:00:00Z',
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText(/All caught up — no upcoming maintenance/i)).toBeInTheDocument();
    expect(screen.getByText('Winter weatherproofing')).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('renders the no-history empty state when there are no projects at all', async () => {
    supabaseResult = { data: [], error: null };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText('No upcoming maintenance.')).toBeInTheDocument();
    expect(screen.queryByText(/Last maintained via/)).not.toBeInTheDocument();
  });

  it('always routes to the detail viewer URL (never the admin edit form)', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-x',
          title: 'Detail view check',
          status: 'planned',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );

    const link = (await screen.findByText('Detail view check')).closest('a');
    expect(link?.getAttribute('href')).toBe('/p/property-a/maintenance/p-x');
  });

  it('renders rows as non-anchor when propertySlug is null', async () => {
    supabaseResult = {
      data: [
        row({
          id: 'p-noslug',
          title: 'Should not link',
          status: 'planned',
          scheduled_for: '2026-05-02',
          completed_at: null,
        }),
      ],
      error: null,
    };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug={null} />,
    );

    const titleEl = await screen.findByText('Should not link');
    expect(titleEl.closest('a')).toBeNull();
  });

  it('renders an inline error message but keeps the header when the query fails', async () => {
    supabaseResult = { data: null, error: { message: 'network down' } };

    render(
      <UpcomingMaintenanceBlock itemId="item-1" propertySlug="property-a" />,
    );

    await screen.findByText('Upcoming Maintenance');
    expect(screen.getByText(/Couldn['']t load maintenance/i)).toBeInTheDocument();
  });
});
