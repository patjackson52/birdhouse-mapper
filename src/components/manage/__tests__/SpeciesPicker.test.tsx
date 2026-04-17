import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesPicker from '@/components/manage/SpeciesPicker';

vi.mock('@/lib/offline/network', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(),
    storage: { from: vi.fn() },
  }),
}));

let mockIsOnline = true;

const baseProps = {
  entityTypeId: 'et-species',
  entityTypeName: 'Species',
  orgId: 'org-1',
  selectedIds: [],
  onChange: vi.fn(),
};

describe('SpeciesPicker (skeleton)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('shows the search input', () => {
    render(<SpeciesPicker {...baseProps} />);
    expect(screen.getByPlaceholderText(/search species/i)).toBeInTheDocument();
  });

  it('shows offline notice when navigator is offline', () => {
    mockIsOnline = false;
    render(<SpeciesPicker {...baseProps} />);
    expect(
      screen.getByText(/search requires internet connection/i)
    ).toBeInTheDocument();
  });

  it('fetches nearby species when focused with coordinates', async () => {
    const nearbyMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: 'Sialia sialis',
            common_name: 'Eastern Bluebird',
            photo_url: null,
            rank: 'species',
            observations_count: 1,
            wikipedia_url: null,
          },
        ]),
        { status: 200 }
      )
    );
    globalThis.fetch = nearbyMock;

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} lat={42.5} lng={-73.5} />);

    await user.click(screen.getByPlaceholderText(/search species/i));

    await waitFor(() =>
      expect(screen.getByText(/recently seen nearby/i)).toBeInTheDocument()
    );
    expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument();

    const called = new URL((nearbyMock.mock.calls[0] as [string])[0], 'http://localhost');
    expect(called.pathname).toBe('/api/species/nearby');
    expect(called.searchParams.get('lat')).toBe('42.5');
    expect(called.searchParams.get('lng')).toBe('-73.5');
  });

  it('does not fetch nearby when coordinates are missing', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<SpeciesPicker {...baseProps} />);
    await user.click(screen.getByPlaceholderText(/search species/i));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/type to search species/i)).toBeInTheDocument();
  });
});

describe('SpeciesPicker (search)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function searchResponse(items: unknown[]) {
    return new Response(JSON.stringify(items), { status: 200 });
  }

  it('debounces search by 300ms before calling /api/species/search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(searchResponse([
        {
          id: 7086,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_url: null,
          rank: 'species',
          observations_count: 42000,
          wikipedia_url: null,
        },
      ]));
    globalThis.fetch = fetchMock;

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} />);

    const input = screen.getByPlaceholderText(/search species/i);
    await user.type(input, 'blue');

    // Before 300ms, no search call fired
    expect(
      fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/species/search')
      )
    ).toHaveLength(0);

    vi.advanceTimersByTime(320);

    await waitFor(() => {
      const searchCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/species/search')
      );
      expect(searchCalls).toHaveLength(1);
      expect(String(searchCalls[0][0])).toContain('q=blue');
    });
  });

  it('renders search results replacing nearby list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      searchResponse([
        {
          id: 1,
          name: 'Sialia sialis',
          common_name: 'Eastern Bluebird',
          photo_url: 'https://example.com/bluebird.jpg',
          rank: 'species',
          observations_count: 99,
          wikipedia_url: null,
        },
      ])
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} />);

    const input = screen.getByPlaceholderText(/search species/i);
    await user.type(input, 'bluebird');
    vi.advanceTimersByTime(320);

    await waitFor(() =>
      expect(screen.getByText('Eastern Bluebird')).toBeInTheDocument()
    );
    expect(screen.getByText('Sialia sialis')).toBeInTheDocument();
    expect(screen.queryByText(/recently seen nearby/i)).not.toBeInTheDocument();
  });
});

describe('SpeciesPicker (selection)', () => {
  beforeEach(() => {
    mockIsOnline = true;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const speciesRow = {
    id: 7086,
    name: 'Sialia sialis',
    common_name: 'Eastern Bluebird',
    photo_url: 'https://example.com/bluebird.jpg',
    rank: 'species',
    observations_count: 42000,
    wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
  };

  function searchResponse(items: unknown[]) {
    return new Response(JSON.stringify(items), { status: 200 });
  }

  it('links to existing entity when external_id matches', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(searchResponse([speciesRow]));

    // supabase.from('entities').select(...).eq('entity_type_id', ...).eq('external_id', '7086')
    //   .maybeSingle() → returns existing row
    const existingRow = { id: 'existing-entity-id' };
    const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ select, insert });

    const supabaseModule = await import('@/lib/supabase/client');
    vi.spyOn(supabaseModule, 'createClient').mockReturnValue({
      from,
      storage: { from: vi.fn() },
    } as unknown as ReturnType<typeof supabaseModule.createClient>);

    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText(/search species/i), 'blue');
    vi.advanceTimersByTime(320);
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByText('Eastern Bluebird'));

    expect(insert).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(['existing-entity-id']);
  });

  it('inserts a new entity when external_id does not exist', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(searchResponse([speciesRow]));

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });

    const insertSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'new-entity-id' }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const from = vi.fn().mockReturnValue({ select, insert });

    const supabaseModule = await import('@/lib/supabase/client');
    vi.spyOn(supabaseModule, 'createClient').mockReturnValue({
      from,
      storage: { from: vi.fn() },
    } as unknown as ReturnType<typeof supabaseModule.createClient>);

    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SpeciesPicker {...baseProps} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText(/search species/i), 'blue');
    vi.advanceTimersByTime(320);
    await waitFor(() => screen.getByText('Eastern Bluebird'));

    await user.click(screen.getByText('Eastern Bluebird'));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const insertedRow = insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({
      entity_type_id: 'et-species',
      org_id: 'org-1',
      name: 'Eastern Bluebird',
      description: 'Sialia sialis',
      external_id: '7086',
    });
    expect(insertedRow.custom_field_values).toMatchObject({
      scientific_name: 'Sialia sialis',
      photo_url: 'https://example.com/bluebird.jpg',
      wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
      observations_count: 42000,
    });
    expect(onChange).toHaveBeenCalledWith(['new-entity-id']);
  });
});
