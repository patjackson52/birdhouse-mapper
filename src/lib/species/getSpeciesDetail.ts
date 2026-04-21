export type SpeciesDetail = {
  external_id: number;
  common_name: string;
  scientific_name: string;
  photo_url: string | null;
  large_photo_url: string | null;
  native: boolean | null;
  cavity_nester: boolean | null;
  iucn_status: string | null;
  summary: string | null;
};

export async function getSpeciesDetail(externalId: number): Promise<SpeciesDetail> {
  const res = await fetch(`https://api.inaturalist.org/v1/taxa/${externalId}`);
  if (!res.ok) throw new Error(`iNat taxa ${externalId}: ${res.status}`);
  const body = await res.json();
  const t = body.results?.[0];
  if (!t) throw new Error(`iNat taxa ${externalId}: no results`);
  return {
    external_id: externalId,
    common_name: t.preferred_common_name ?? t.name ?? 'Unknown',
    scientific_name: t.name ?? '',
    photo_url: t.default_photo?.medium_url ?? null,
    large_photo_url: t.default_photo?.original_url ?? t.default_photo?.medium_url ?? null,
    native: null,
    cavity_nester: null,
    iucn_status: t.conservation_status?.iucn ?? null,
    summary: t.wikipedia_summary ?? null,
  };
}
