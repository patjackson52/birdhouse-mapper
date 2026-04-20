'use client';

import { useEffect, useState } from 'react';
import type { SpeciesDetail } from '@/lib/types';

export function useSpeciesDetail(
  taxonId: number | null,
  lat: number | undefined,
  lng: number | undefined,
  cache: Map<number, SpeciesDetail>,
  enabled: boolean
): { detail: SpeciesDetail | null; loading: boolean; error: boolean } {
  const [detail, setDetail] = useState<SpeciesDetail | null>(() =>
    taxonId !== null ? cache.get(taxonId) ?? null : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (taxonId === null) {
      setDetail(null);
      setLoading(false);
      setError(false);
      return;
    }

    const cached = cache.get(taxonId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(false);
      return;
    }

    if (!enabled) {
      setDetail(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    const url = new URL(`/api/species/${taxonId}`, 'http://localhost');
    if (typeof lat === 'number' && typeof lng === 'number') {
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lng', String(lng));
    }

    fetch(url.pathname + url.search)
      .then(async (r) => (r.ok ? r.json() : { error: 'unavailable' }))
      .then((body: SpeciesDetail | { error: string }) => {
        if (cancelled) return;
        if ('error' in body) {
          setDetail(null);
          setError(true);
        } else {
          cache.set(taxonId, body);
          setDetail(body);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taxonId, lat, lng, enabled, cache]);

  return { detail, loading, error };
}
