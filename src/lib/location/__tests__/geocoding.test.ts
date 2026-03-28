import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodeLocation } from '../geocoding';

describe('geocodeLocation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns lat/lng for a valid city query', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '64.8378', lon: '-147.7164', display_name: 'Fairbanks, AK' }],
    } as Response);

    const result = await geocodeLocation('Fairbanks, AK');

    expect(result).toEqual({ lat: 64.8378, lng: -147.7164 });
  });

  it('calls Nominatim with correct URL and headers', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '51.5074', lon: '-0.1278', display_name: 'London' }],
    } as Response);

    await geocodeLocation('London');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/search?q=London&format=json&limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'birdhouse-mapper/1.0' }),
      })
    );
  });

  it('returns null when no results found', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const result = await geocodeLocation('zzznotacityzzzz');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await geocodeLocation('London');

    expect(result).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => [],
    } as Response);

    const result = await geocodeLocation('London');

    expect(result).toBeNull();
  });
});
