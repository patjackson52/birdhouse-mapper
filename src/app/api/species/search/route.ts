import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaceId } from '@/lib/species/place-id-cache';
import { toSpeciesResult, type INatTaxonRaw } from '@/lib/species/inat-projection';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const taxonId = request.nextUrl.searchParams.get('taxon_id');
  const latRaw = request.nextUrl.searchParams.get('lat');
  const lngRaw = request.nextUrl.searchParams.get('lng');

  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: q' },
      { status: 400 }
    );
  }

  let placeId: number | null = null;
  if (latRaw !== null && lngRaw !== null) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      placeId = await resolvePlaceId(lat, lng);
    }
  }

  const upstream = new URL('https://api.inaturalist.org/v1/taxa/autocomplete');
  upstream.searchParams.set('q', q);
  upstream.searchParams.set('per_page', '20');
  if (taxonId) upstream.searchParams.set('taxon_id', taxonId);
  if (placeId !== null) upstream.searchParams.set('place_id', String(placeId));

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
