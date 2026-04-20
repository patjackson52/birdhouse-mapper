// Server-side only. Resolves an iNat place_id from lat/lng using an in-memory
// LRU keyed by lat/lng rounded to 1 decimal place (~11 km cell).
// Null is a legitimate cached value meaning "no state-level place exists here."

const MAX_ENTRIES = 500;
const STATE_ADMIN_LEVEL = 20; // iNat convention: 10=country, 20=state/province, 30=county
const FETCH_TIMEOUT_MS = 5000;

interface INatPlace {
  id: number;
  admin_level: number;
  name?: string;
}

// Map preserves insertion order; we re-insert on read to implement LRU.
const cache = new Map<string, number | null>();

// Dedups concurrent in-flight requests keyed by the rounded lat/lng cell.
const inflight = new Map<string, Promise<number | null>>();

function keyFor(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

function touch(key: string, value: number | null): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function resolvePlaceId(lat: number, lng: number): Promise<number | null> {
  const key = keyFor(lat, lng);
  if (cache.has(key)) {
    const cached = cache.get(key) ?? null;
    touch(key, cached);
    return cached;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const bbox = 0.05; // degrees
  const upstream = new URL('https://api.inaturalist.org/v1/places/nearby');
  upstream.searchParams.set('nelat', String(lat + bbox));
  upstream.searchParams.set('nelng', String(lng + bbox));
  upstream.searchParams.set('swlat', String(lat - bbox));
  upstream.searchParams.set('swlng', String(lng - bbox));
  upstream.searchParams.set('per_page', '30');

  const promise = (async (): Promise<number | null> => {
    try {
      const res = await fetch(upstream.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        touch(key, null);
        return null;
      }
      const json = (await res.json()) as { results?: { standard?: INatPlace[]; community?: INatPlace[] } };
      const allPlaces = [...(json.results?.standard ?? []), ...(json.results?.community ?? [])];
      const statePlace = allPlaces.find((p) => p.admin_level === STATE_ADMIN_LEVEL);
      const value = statePlace?.id ?? null;
      touch(key, value);
      return value;
    } catch {
      touch(key, null);
      return null;
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

// Test-only helpers. Not re-exported from a barrel; consumers should not import these.
export function __resetPlaceIdCacheForTests(): void {
  cache.clear();
}

export function __getPlaceIdCacheSizeForTests(): number {
  return cache.size;
}
