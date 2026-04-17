import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;

describe('GET /api/species/nearby', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
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
    const fetchMock = vi.fn().mockResolvedValueOnce(
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

    const callUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(callUrl.searchParams.get('lat')).toBe('42.5');
    expect(callUrl.searchParams.get('lng')).toBe('-73.5');
    expect(callUrl.searchParams.get('radius')).toBe('10');
  });

  it('caps radius at 50km', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    globalThis.fetch = fetchMock;

    const { GET } = await import('../nearby/route');
    const request = new NextRequest(
      'http://localhost/api/species/nearby?lat=42&lng=-73&radius=999'
    );
    await GET(request);

    const callUrl = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(callUrl.searchParams.get('radius')).toBe('50');
  });

  it('returns empty array on upstream error', async () => {
    globalThis.fetch = vi
      .fn()
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
