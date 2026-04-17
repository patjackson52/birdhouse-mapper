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
  const q = request.nextUrl.searchParams.get('q');
  const taxonId = request.nextUrl.searchParams.get('taxon_id');

  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: q' },
      { status: 400 }
    );
  }

  const upstream = new URL('https://api.inaturalist.org/v1/taxa/autocomplete');
  upstream.searchParams.set('q', q);
  upstream.searchParams.set('per_page', '20');
  if (taxonId) upstream.searchParams.set('taxon_id', taxonId);

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json([], {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    const json = (await res.json()) as { results?: INatTaxonRaw[] };
    const results = (json.results ?? []).map(toSpeciesResult);

    return NextResponse.json(results, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }
}
