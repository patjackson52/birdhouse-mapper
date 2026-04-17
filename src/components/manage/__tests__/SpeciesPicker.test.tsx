import { describe, it, expect, vi, beforeEach } from 'vitest';
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
