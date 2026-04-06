import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress, resolveCountyFips } from '@/lib/geo/census-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('geocodeAddress', () => {
  it('returns lat/lng for a valid address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          addressMatches: [
            {
              coordinates: { x: -122.555, y: 47.634 },
              matchedAddress: '7550 FLETCHER BAY RD NE, BAINBRIDGE ISLAND, WA, 98110',
            },
          ],
        },
      }),
    });

    const result = await geocodeAddress('7550 Fletcher Bay Rd NE, Bainbridge Island, WA');
    expect(result).toEqual({
      lat: 47.634,
      lng: -122.555,
      matchedAddress: '7550 FLETCHER BAY RD NE, BAINBRIDGE ISLAND, WA, 98110',
    });
  });

  it('returns null when no matches found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { addressMatches: [] },
      }),
    });

    const result = await geocodeAddress('nonexistent address');
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeAddress('some address');
    expect(result).toBeNull();
  });
});

describe('resolveCountyFips', () => {
  it('returns county FIPS and name for valid coordinates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          geographies: {
            Counties: [
              { GEOID: '53035', NAME: 'Kitsap', STATE: '53', COUNTY: '035' },
            ],
          },
        },
      }),
    });

    const result = await resolveCountyFips(47.634, -122.555);
    expect(result).toEqual({
      fips: '53035',
      county_name: 'Kitsap',
      state_fips: '53',
    });
  });

  it('returns null when no county found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { geographies: { Counties: [] } },
      }),
    });

    const result = await resolveCountyFips(0, 0);
    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await resolveCountyFips(47.634, -122.555);
    expect(result).toBeNull();
  });
});
