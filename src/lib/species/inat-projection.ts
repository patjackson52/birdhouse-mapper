import type { SpeciesResult, SpeciesEstablishmentMeans } from '@/lib/types';

export interface INatTaxonRaw {
  id: number;
  name: string;
  preferred_common_name?: string | null;
  default_photo?: {
    square_url?: string | null;
    medium_url?: string | null;
    large_url?: string | null;
  } | null;
  rank?: string;
  observations_count?: number;
  wikipedia_url?: string | null;
  conservation_status?: { iucn?: number | null } | null;
  // When place_id is supplied, iNat returns the place-scoped listing first.
  establishment_means?: { establishment_means?: string | null } | null;
  listed_taxa?: Array<{ establishment_means?: string | null }>;
}

// iNat numeric IUCN scale. 0 and 5 are "Not Evaluated" and "Data Deficient"
// respectively; 10-70 are the threatened-category rungs.
export const IUCN_CODE: Record<number, string> = {
  0: 'NE', 5: 'DD',
  10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX',
};

export function iucnCodeOf(raw: INatTaxonRaw): string | null {
  const iucnRaw = raw.conservation_status?.iucn ?? null;
  return iucnRaw != null ? IUCN_CODE[iucnRaw] ?? null : null;
}

export function toEstablishmentMeans(raw: INatTaxonRaw): SpeciesEstablishmentMeans {
  const em =
    raw.establishment_means?.establishment_means ??
    raw.listed_taxa?.[0]?.establishment_means ??
    null;
  if (em === 'native' || em === 'endemic') return 'native';
  if (em === 'introduced' || em === 'invasive' || em === 'naturalised' || em === 'naturalized') return 'introduced';
  return null;
}

export function toSpeciesResult(raw: INatTaxonRaw): SpeciesResult {
  return {
    id: raw.id,
    name: raw.name,
    common_name: raw.preferred_common_name || raw.name,
    photo_url: raw.default_photo?.medium_url ?? null,
    photo_square_url: raw.default_photo?.square_url ?? null,
    rank: raw.rank ?? 'unknown',
    observations_count: raw.observations_count ?? 0,
    wikipedia_url: raw.wikipedia_url ?? null,
    establishment_means: toEstablishmentMeans(raw),
    iucn_code: iucnCodeOf(raw),
  };
}
