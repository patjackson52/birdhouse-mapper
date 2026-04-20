import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetPlaceIdCacheForTests } from '@/lib/species/place-id-cache';

const originalFetch = globalThis.fetch;

// The nearby route calls resolvePlaceId before the species_counts upstream,
// so most tests need a place-id fetch mock queued first. Returning an empty
// results payload yields a null place_id (no state-level match).
function placeIdEmptyResponse() {
  return new Response(
    JSON.stringify({ results: { standard: [], community: [] } }),
    { status: 200 }
  );
}

describe('GET /api/species/nearby', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    __resetPlaceIdCacheForTests();
  });

  it('rejects requests without lat', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lng=-73');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('rejects requests without lng', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lat=42');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('rejects non-numeric lat/lng', async () => {
    const { GET } = await import('../nearby/route');
    const request = new NextRequest('http://localhost/api/species/nearby?lat=abc&lng=xyz');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns trimmed SpeciesResult array from species_counts response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(placeIdEmptyResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                count: 99,
                taxon: {
                  id: 7086,
                  name: 'Sialia sialis',
                  preferred_common_name: 'Eastern Bluebird',
                  default_photo: { medium_url: 'https://example.com/bluebird.jpg' },
                  rank: 'species',
                  observations_count: 42000,
                  wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
    globalThis.fetch = fetchMock;

    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42.5&lng=-73.5'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(7086);
    expect(body[0].common_name).toBe('Eastern Bluebird');
    expect(body[0].nearby_count).toBe(99);
    expect(body[0].photo_square_url).toBe(null);
    expect(body[0].establishment_means).toBe(null);
    expect(body[0].iucn_code).toBe(null);

    // calls[0] is the place-id lookup; calls[1] is the species_counts upstream.
    const callUrl = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(callUrl.searchParams.get('lat')).toBe('42.5');
    expect(callUrl.searchParams.get('lng')).toBe('-73.5');
    expect(callUrl.searchParams.get('radius')).toBe('10');
  });

  it('caps radius at 50km', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(placeIdEmptyResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    globalThis.fetch = fetchMock;

    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42&lng=-73&radius=999'
    );
    await GET(request);

    // calls[0] is the place-id lookup; calls[1] is the species_counts upstream.
    const callUrl = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(callUrl.searchParams.get('radius')).toBe('50');
  });

  it('returns empty array on upstream error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(placeIdEmptyResponse())
      .mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42&lng=-73'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
