import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;

describe('GET /api/species/search', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects requests without q parameter', async () => {
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('q');
  });

  it('returns trimmed SpeciesResult array from iNaturalist response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 7086,
              name: 'Sialia sialis',
              preferred_common_name: 'Eastern Bluebird',
              default_photo: { medium_url: 'https://example.com/bluebird.jpg' },
              rank: 'species',
              observations_count: 42000,
              wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([
      {
        id: 7086,
        name: 'Sialia sialis',
        common_name: 'Eastern Bluebird',
        photo_url: 'https://example.com/bluebird.jpg',
        photo_square_url: null,
        rank: 'species',
        observations_count: 42000,
        wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
        establishment_means: null,
        iucn_code: null,
      },
    ]);
  });

  it('returns empty array when iNaturalist errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('upstream down', { status: 503 })
    );

    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network'));
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=bluebird');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('falls back to name when preferred_common_name is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: 'Unknown Taxon',
              preferred_common_name: null,
              default_photo: null,
              rank: 'species',
              observations_count: 0,
              wikipedia_url: null,
            },
          ],
        }),
        { status: 200 }
      )
    );
    const { GET } = await import('../search/route');
    const request = new NextRequest('http://localhost/api/species/search?q=x');
    const response = await GET(request);
    const body = await response.json();
    expect(body[0].common_name).toBe('Unknown Taxon');
    expect(body[0].photo_url).toBeNull();
  });
});
