import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '../[id]/route';
import { NextRequest } from 'next/server';
import { __resetPlaceIdCacheForTests } from '@/lib/species/place-id-cache';

function buildRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

function mockINatTaxonResponse(taxon: Record<string, unknown>) {
  globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/v1/places/nearby')) {
      return new Response(
        JSON.stringify({ results: { standard: [{ id: 54, admin_level: 20, name: 'Vermont' }], community: [] } }),
        { status: 200 }
      );
    }
    if (u.includes('/v1/taxa/')) {
      return new Response(JSON.stringify({ results: [taxon] }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

describe('GET /api/species/[id]', () => {
  beforeEach(() => {
    __resetPlaceIdCacheForTests();
    vi.restoreAllMocks();
  });

  it('returns a SpeciesDetail for a known taxon', async () => {
    mockINatTaxonResponse({
      id: 12727,
      name: 'Sialia sialis',
      preferred_common_name: 'Eastern Bluebird',
      rank: 'species',
      observations_count: 42000,
      wikipedia_url: 'https://en.wikipedia.org/wiki/Eastern_bluebird',
      wikipedia_summary: '<p>The <i>eastern bluebird</i> is a small thrush.</p>',
      default_photo: {
        square_url: 'https://example.com/sq.jpg',
        medium_url: 'https://example.com/md.jpg',
        large_url: 'https://example.com/lg.jpg',
      },
      conservation_status: { iucn: 10 },
      ancestors: [
        { id: 1, name: 'Animalia', rank: 'kingdom' },
        { id: 2, name: 'Chordata', rank: 'phylum' },
        { id: 3, name: 'Aves', rank: 'class' },
        { id: 4, name: 'Passeriformes', rank: 'order' },
        { id: 5, name: 'Turdidae', rank: 'family' },
      ],
    });

    const req = buildRequest('http://localhost/api/species/12727?lat=43.5&lng=-72.6');
    const res = await GET(req, { params: Promise.resolve({ id: '12727' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(12727);
    expect(body.common_name).toBe('Eastern Bluebird');
    expect(body.photo_large_url).toBe('https://example.com/lg.jpg');
    expect(body.photo_medium_url).toBe('https://example.com/md.jpg');
    expect(body.photo_square_url).toBe('https://example.com/sq.jpg');
    expect(body.iucn_code).toBe('LC');
    expect(body.wikipedia_summary).toBe('The eastern bluebird is a small thrush.');
    expect(body.family).toBe('Turdidae');
    expect(body.ancestry).toEqual([
      { id: 1, name: 'Animalia', rank: 'kingdom' },
      { id: 2, name: 'Chordata', rank: 'phylum' },
      { id: 3, name: 'Aves', rank: 'class' },
      { id: 4, name: 'Passeriformes', rank: 'order' },
      { id: 5, name: 'Turdidae', rank: 'family' },
    ]);
  });

  it('returns 200 with { error: "unavailable" } when iNat fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const req = buildRequest('http://localhost/api/species/12727');
    const res = await GET(req, { params: Promise.resolve({ id: '12727' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ error: 'unavailable' });
  });

  it('passes place_id to the iNat taxon call when lat/lng are given', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: RequestInfo) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/v1/places/nearby')) {
        return new Response(
          JSON.stringify({ results: { standard: [{ id: 54, admin_level: 20, name: 'Vermont' }], community: [] } }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ results: [{ id: 1, name: 'X', rank: 'species' }] }),
        { status: 200 }
      );
    });
    globalThis.fetch = fetchMock;

    const req = buildRequest('http://localhost/api/species/1?lat=43.5&lng=-72.6');
    await GET(req, { params: Promise.resolve({ id: '1' }) });

    const taxonCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/v1/taxa/1')
    );
    expect(taxonCall).toBeDefined();
    expect(String(taxonCall![0])).toContain('place_id=54');
  });
});
