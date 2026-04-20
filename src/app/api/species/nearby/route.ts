import { NextRequest, NextResponse } from 'next/server';
import type { SpeciesResult } from '@/lib/types';
import { resolvePlaceId } from '@/lib/species/place-id-cache';
import { toSpeciesResult, type INatTaxonRaw } from '@/lib/species/inat-projection';

function toNearbyResult(raw: INatTaxonRaw, nearbyCount: number): SpeciesResult {
  return { ...toSpeciesResult(raw), nearby_count: nearbyCount };
}

export async function GET(request: NextRequest) {
  const latRaw = request.nextUrl.searchParams.get('lat');
  const lngRaw = request.nextUrl.searchParams.get('lng');
  const radiusRaw = request.nextUrl.searchParams.get('radius');

  const lat = latRaw !== null ? Number(latRaw) : NaN;
  const lng = lngRaw !== null ? Number(lngRaw) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Missing or invalid required parameters: lat, lng' },
      { status: 400 }
    );
  }

  const requestedRadius = radiusRaw !== null ? Number(radiusRaw) : 10;
  const radius = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(requestedRadius, 1), 50)
    : 10;

  const placeId = await resolvePlaceId(lat, lng);

  const upstream = new URL(
    'https://api.inaturalist.org/v1/observations/species_counts'
  );
  upstream.searchParams.set('lat', String(lat));
  upstream.searchParams.set('lng', String(lng));
  upstream.searchParams.set('radius', String(radius));
  upstream.searchParams.set('per_page', '20');
  if (placeId !== null) upstream.searchParams.set('place_id', String(placeId));

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const json = (await res.json()) as {
      results?: Array<{ taxon: INatTaxonRaw; count?: number }>;
    };

    const results = (json.results ?? [])
      .filter((r) => r.taxon)
      .map((r) => toNearbyResult(r.taxon, r.count ?? 0));

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }
}
