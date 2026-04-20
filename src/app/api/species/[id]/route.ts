import { NextRequest, NextResponse } from 'next/server';
import type {
  SpeciesDetail,
  SpeciesEstablishmentMeans,
  SpeciesAncestor,
} from '@/lib/types';
import { resolvePlaceId } from '@/lib/species/place-id-cache';
import {
  iucnCodeOf,
  toEstablishmentMeans,
  type INatTaxonRaw,
} from '@/lib/species/inat-projection';

export const revalidate = 86400;

interface INatTaxonDetailRaw extends INatTaxonRaw {
  wikipedia_summary?: string | null;
  ancestors?: Array<{ id: number; name: string; rank: string }>;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const noTags = input.replace(/<[^>]+>/g, '');
  const decoded = noTags.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => ENTITY_MAP[m] ?? m);
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

function toSpeciesDetail(raw: INatTaxonDetailRaw): SpeciesDetail {
  const ancestry: SpeciesAncestor[] = (raw.ancestors ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    rank: a.rank,
  }));
  const family = ancestry.find((a) => a.rank === 'family')?.name ?? null;
  const establishment: SpeciesEstablishmentMeans = toEstablishmentMeans(raw);

  return {
    id: raw.id,
    name: raw.name,
    common_name: raw.preferred_common_name || raw.name,
    photo_square_url: raw.default_photo?.square_url ?? null,
    photo_medium_url: raw.default_photo?.medium_url ?? null,
    photo_large_url: raw.default_photo?.large_url ?? null,
    rank: raw.rank ?? 'unknown',
    observations_count: raw.observations_count ?? 0,
    wikipedia_url: raw.wikipedia_url ?? null,
    wikipedia_summary: stripHtml(raw.wikipedia_summary),
    iucn_code: iucnCodeOf(raw),
    establishment_means: establishment,
    ancestry,
    family,
    nearby_count: null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taxonId = Number(id);
  if (!Number.isFinite(taxonId) || taxonId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const latRaw = request.nextUrl.searchParams.get('lat');
  const lngRaw = request.nextUrl.searchParams.get('lng');

  let placeId: number | null = null;
  if (latRaw !== null && lngRaw !== null) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      placeId = await resolvePlaceId(lat, lng);
    }
  }

  const upstream = new URL(`https://api.inaturalist.org/v1/taxa/${taxonId}`);
  if (placeId !== null) upstream.searchParams.set('place_id', String(placeId));

  try {
    const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return NextResponse.json({ error: 'unavailable' }, { status: 200 });
    }
    const json = (await res.json()) as { results?: INatTaxonDetailRaw[] };
    const raw = json.results?.[0];
    if (!raw) {
      return NextResponse.json({ error: 'unavailable' }, { status: 200 });
    }
    return NextResponse.json(toSpeciesDetail(raw), { status: 200 });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 200 });
  }
}
