import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesPicker from '@/components/manage/SpeciesPicker';

let mockIsOnline = true;

// Framer-motion stub so sheet content renders immediately in JSDOM.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, style, animate, initial, exit, transition, ...props }: any) => (
      <div
        {...props}
        style={{
          ...style,
          ...(animate && typeof animate === 'object' ? animate : {}),
        }}
      >
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// JSDOM lacks ResizeObserver; MultiSnapBottomSheet requires it.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

vi.mock('@/lib/offline/network', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline }),
}));

vi.mock('@/lib/location/provider', () => ({
  useUserLocation: () => ({
    position: null,
    accuracy: null,
    heading: null,
    error: null,
    isTracking: false,
    startTracking: () => {},
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseMock,
}));

vi.mock('@/lib/offline/db', () => ({
  getOfflineDb: () => (getOfflineDbMock as (...args: unknown[]) => unknown)(),
}));

vi.mock('@/lib/offline/mutations', () => ({
  enqueueMutation: (...args: unknown[]) =>
    (enqueueMutationMock as (...args: unknown[]) => unknown)(...args),
}));

let supabaseMock: {
  from: ReturnType<typeof vi.fn>;
  storage: { from: ReturnType<typeof vi.fn> };
};
let getOfflineDbMock: ReturnType<typeof vi.fn>;
let enqueueMutationMock: ReturnType<typeof vi.fn>;

const baseProps = {
  entityTypeId: 'et-species',
  entityTypeName: 'Species',
  orgId: 'org-1',
  selectedIds: [] as string[],
  onChange: vi.fn(),
};

function speciesJson(species: unknown[]) {
  return new Response(JSON.stringify(species), { status: 200 });
}

function detailJson(detail: Record<string, unknown>) {
  return new Response(JSON.stringify(detail), { status: 200 });
}

// Supabase mock that handles both the pill loader (.select().in()) and
// the recent-species loader (.select().eq().eq().order().limit()), plus
// the picker's dedup check (.select().eq().eq().maybeSingle()) and inserts.
function makeFlexibleSupabase(opts: {
  pills?: unknown[];
  recent?: unknown[];
  existingById?: { id: string } | null;
  insertResult?: { id: string };
}) {
  const pillIn = vi.fn().mockResolvedValue({ data: opts.pills ?? [], error: null });
  const recentLimit = vi.fn().mockResolvedValue({ data: opts.recent ?? [], error: null });
  const recentOrder = vi.fn().mockReturnValue({ limit: recentLimit });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.existingById ?? null, error: null });
  const insertSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.insertResult ?? null, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const selectChain = () => ({
    in: pillIn,
    eq: (..._a: unknown[]) => ({
      eq: (..._b: unknown[]) => ({
        maybeSingle,
        order: recentOrder,
      }),
    }),
  });

  const from = vi.fn().mockImplementation(() => ({
    select: (..._a: unknown[]) => selectChain(),
    insert,
  }));

  supabaseMock = {
    from,
    storage: { from: vi.fn() },
  };

  return { pillIn, recentLimit, maybeSingle, insert, insertSingle };
}

describe('SpeciesPicker (trigger + sheet)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(speciesJson([]));
    makeFlexibleSupabase({});
    getOfflineDbMock = vi.fn();
    enqueueMutationMock = vi.fn();
  });

  it('renders the trigger button with the entity type name', () => {
    render(<SpeciesPicker {...baseProps} />);
    expect(
      screen.getByRole('button', { name: /add species/i })
    ).toBeInTheDocument();
  });

  it('opens the sheet when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    expect(screen.getByRole('tab', { name: /recent/i })).toBeInTheDocument();
  });

  it('shows offline banner inside the sheet when offline', async () => {
    mockIsOnline = false;
    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    expect(
      screen.getByText(/search requires internet connection/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /all/i })).toBeDisabled();
  });

  it('disables the search input when offline', async () => {
    mockIsOnline = false;
    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    expect(screen.getByPlaceholderText(/search species/i)).toBeDisabled();
  });
});

describe('SpeciesPicker (grid + detail flow)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    makeFlexibleSupabase({});
    getOfflineDbMock = vi.fn();
    enqueueMutationMock = vi.fn();
  });

  const bluebirdCard = {
    id: 12727,
    name: 'Sialia sialis',
    common_name: 'Eastern Bluebird',
    photo_url: 'https://example.com/md.jpg',
    photo_square_url: 'https://example.com/sq.jpg',
    rank: 'species',
    observations_count: 42000,
    wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
    nearby_count: 17,
    establishment_means: 'native',
    iucn_code: 'LC',
  };

  const starlingCard = {
    id: 13858,
    name: 'Sturnus vulgaris',
    common_name: 'European Starling',
    photo_url: 'https://example.com/st.jpg',
    photo_square_url: null,
    rank: 'species',
    observations_count: 1,
    wikipedia_url: null,
    nearby_count: 3,
    establishment_means: 'introduced',
    iucn_code: 'LC',
  };

  it('uses lat/lng to fetch nearby and renders cards with introduced pill', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: RequestInfo) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/species/nearby')) {
        return speciesJson([bluebirdCard, starlingCard]);
      }
      return speciesJson([]);
    });
    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} lat={43.5} lng={-72.6} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));

    await waitFor(() =>
      expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument()
    );
    expect(screen.getByText('European Starling')).toBeInTheDocument();
    expect(screen.getAllByTestId('introduced-pill')).toHaveLength(1);
    const nearbyCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/species/nearby')
    );
    expect(String(nearbyCall![0])).toContain('lat=43.5');
    expect(String(nearbyCall![0])).toContain('lng=-72.6');
  });

  it('Native filter hides introduced cards and keeps unknown-status cards visible', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/species/nearby')) {
        return speciesJson([
          bluebirdCard,
          starlingCard,
          { ...bluebirdCard, id: 99999, common_name: 'Unknown Status', establishment_means: null },
        ]);
      }
      return speciesJson([]);
    });

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} lat={43.5} lng={-72.6} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    await waitFor(() =>
      expect(screen.getByText('European Starling')).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /^native$/i }));
    expect(screen.queryByText('European Starling')).not.toBeInTheDocument();
    expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument();
    expect(screen.getByText('Unknown Status')).toBeInTheDocument();
  });

  it('tapping a card opens detail and CTA toggles staged', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/species/nearby')) return speciesJson([bluebirdCard]);
      if (u.includes('/api/species/12727')) {
        return detailJson({
          id: 12727,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_square_url: 'https://example.com/sq.jpg',
          photo_medium_url: 'https://example.com/md.jpg',
          photo_large_url: 'https://example.com/lg.jpg',
          rank: 'species',
          observations_count: 42000,
          wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
          wikipedia_summary: 'A small thrush.',
          iucn_code: 'LC',
          establishment_means: 'native',
          ancestry: [{ id: 1, name: 'Turdidae', rank: 'family' }],
          family: 'Turdidae',
          nearby_count: null,
        });
      }
      return speciesJson([]);
    });

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} lat={43.5} lng={-72.6} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByRole('button', { name: /view details for eastern bluebird/i }));
    await waitFor(() =>
      expect(screen.getByText(/a small thrush/i)).toBeInTheDocument()
    );

    const addButton = screen.getByRole('button', { name: /add to this update/i });
    await user.click(addButton);
    expect(
      screen.getByRole('button', { name: /remove from this update/i })
    ).toBeInTheDocument();
  });

  it('pressing Done after adding a new taxon inserts one entity and calls onChange once', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/species/nearby')) return speciesJson([bluebirdCard]);
      if (u.includes('/api/species/12727')) {
        return detailJson({
          id: 12727,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_square_url: null,
          photo_medium_url: null,
          photo_large_url: null,
          rank: 'species',
          observations_count: 0,
          wikipedia_url: null,
          wikipedia_summary: null,
          iucn_code: null,
          establishment_means: 'native',
          ancestry: [],
          family: null,
          nearby_count: null,
        });
      }
      return speciesJson([]);
    });

    const { insert } = makeFlexibleSupabase({
      existingById: null,
      insertResult: { id: 'new-entity-id' },
    });

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeciesPicker {...baseProps} onChange={onChange} lat={43.5} lng={-72.6} />
    );
    await user.click(screen.getByRole('button', { name: /add species/i }));
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByRole('button', { name: /view details for eastern bluebird/i }));
    await waitFor(() => screen.getByRole('button', { name: /add to this update/i }));
    await user.click(screen.getByRole('button', { name: /add to this update/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const inserted = insert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      entity_type_id: 'et-species',
      org_id: 'org-1',
      name: 'Eastern Bluebird',
      description: 'Sialia sialis',
      external_id: '12727',
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['new-entity-id']);
  });

  it('pressing Done offline with no staged changes calls onChange once with empty kept ids', async () => {
    mockIsOnline = false;
    globalThis.fetch = vi.fn().mockResolvedValue(speciesJson([]));

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('canceling the sheet (close button) does not call onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /add species/i }));
    await user.click(screen.getByRole('button', { name: /close species picker/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SpeciesPicker (pills)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    getOfflineDbMock = vi.fn();
    enqueueMutationMock = vi.fn();
  });

  it('renders a pill for each selected entity and allows × removal', async () => {
    makeFlexibleSupabase({
      pills: [
        {
          id: 'e1',
          name: 'Eastern Bluebird',
          description: 'Sialia sialis',
          external_id: '12727',
          custom_field_values: { photo_url: 'https://example.com/b.jpg' },
        },
      ],
    });

    const onChange = vi.fn();
    render(
      <SpeciesPicker {...baseProps} selectedIds={['e1']} onChange={onChange} />
    );
    await waitFor(() =>
      expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument()
    );
    const removeBtn = screen.getByRole('button', {
      name: /remove eastern bluebird/i,
    });
    const user = userEvent.setup();
    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
