import { NextRequest, NextResponse } from 'next/server';
import type { SpeciesResult } from '@/lib/types';

interface INatTaxonRaw {
  id: number;
  name: string;
  preferred_common_name?: string | null;
  default_photo?: { medium_url?: string | null } | null;
  rank?: string;
  observations_count?: number;
  wikipedia_url?: string | null;
}

function toSpeciesResult(raw: INatTaxonRaw): SpeciesResult {
  return {
    id: raw.id,
    name: raw.name,
    common_name: raw.preferred_common_name || raw.name,
    photo_url: raw.default_photo?.medium_url ?? null,
    rank: raw.rank ?? 'unknown',
    observations_count: raw.observations_count ?? 0,
    wikipedia_url: raw.wikipedia_url ?? null,
  };
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

  const upstream = new URL(
    'https://api.inaturalist.org/v1/observations/species_counts'
  );
  upstream.searchParams.set('lat', String(lat));
  upstream.searchParams.set('lng', String(lng));
  upstream.searchParams.set('radius', String(radius));
  upstream.searchParams.set('per_page', '20');

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
      results?: Array<{ taxon: INatTaxonRaw }>;
    };

    const results = (json.results ?? [])
      .filter((r) => r.taxon)
      .map((r) => toSpeciesResult(r.taxon));

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
