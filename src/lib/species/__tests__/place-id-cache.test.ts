import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolvePlaceId,
  __resetPlaceIdCacheForTests,
  __getPlaceIdCacheSizeForTests,
} from '../place-id-cache';

function mockINatResponse(places: Array<{ id: number; admin_level: number; name: string }>) {
  const response = new Response(
    JSON.stringify({ results: { standard: places, community: [] } }),
    { status: 200 }
  );
  globalThis.fetch = vi.fn().mockResolvedValue(response);
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

describe('resolvePlaceId', () => {
  beforeEach(() => {
    __resetPlaceIdCacheForTests();
    vi.restoreAllMocks();
  });

  it('resolves the smallest state-level place (admin_level 20)', async () => {
    mockINatResponse([
      { id: 97394, admin_level: 10, name: 'United States' },
      { id: 54, admin_level: 20, name: 'Vermont' },
      { id: 54321, admin_level: 30, name: 'Windham County' },
    ]);

    const placeId = await resolvePlaceId(43.5, -72.6);
    expect(placeId).toBe(54);
  });

  it('returns null when iNat returns no state-level place', async () => {
    mockINatResponse([
      { id: 97394, admin_level: 10, name: 'United States' },
    ]);
    const placeId = await resolvePlaceId(43.5, -72.6);
    expect(placeId).toBeNull();
  });

  it('caches resolved place ids by rounded lat/lng (1 decimal)', async () => {
    const fetchMock = mockINatResponse([
      { id: 54, admin_level: 20, name: 'Vermont' },
    ]);
    await resolvePlaceId(43.51, -72.61); // rounds to 43.5,-72.6
    await resolvePlaceId(43.54, -72.58); // rounds to 43.5,-72.6 — cache hit
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches null as a valid value (no re-fetch for known-unresolvable cells)', async () => {
    const fetchMock = mockINatResponse([
      { id: 97394, admin_level: 10, name: 'United States' },
    ]);
    await resolvePlaceId(0, 0);
    await resolvePlaceId(0, 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null on iNat fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const placeId = await resolvePlaceId(43.5, -72.6);
    expect(placeId).toBeNull();
  });

  it('deduplicates concurrent in-flight requests for the same rounded key', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    results: { standard: [{ id: 54, admin_level: 20, name: 'Vermont' }], community: [] },
                  }),
                  { status: 200 }
                )
              ),
            0
          )
        )
    );
    globalThis.fetch = fetchMock;

    const [a, b] = await Promise.all([resolvePlaceId(43.5, -72.6), resolvePlaceId(43.5, -72.6)]);
    expect(a).toBe(54);
    expect(b).toBe(54);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('LRU-evicts past max cache size (500)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ results: { standard: [{ id: 1, admin_level: 20, name: 'X' }], community: [] } }),
        { status: 200 }
      );
    });
    for (let i = 0; i < 501; i++) {
      const lat = Math.floor(i / 10) * 0.1;
      const lng = (i % 10) * 0.1;
      await resolvePlaceId(lat, lng);
    }
    expect(__getPlaceIdCacheSizeForTests()).toBeLessThanOrEqual(500);
  });
});
