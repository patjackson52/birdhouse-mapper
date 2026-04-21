'use client';

import type { ReactElement } from 'react';
import type { SpeciesDetail, SpeciesResult } from '@/lib/types';
import { isCavityNester } from '@/lib/species/cavity-nesters';
import { SpeciesTaxonomySection } from '@/components/species/SpeciesTaxonomySection';
import { useSpeciesDetail } from './useSpeciesDetail';

interface SpeciesPickerDetailProps {
  card: SpeciesResult;
  detailCache: Map<number, SpeciesDetail>;
  lat?: number;
  lng?: number;
  isOnline: boolean;
  isStaged: boolean;
  onBack: () => void;
  onToggle: () => void;
}

export default function SpeciesPickerDetail({
  card,
  detailCache,
  lat,
  lng,
  isOnline,
  isStaged,
  onBack,
  onToggle,
}: SpeciesPickerDetailProps): ReactElement {
  const { detail, loading, error } = useSpeciesDetail(
    card.id,
    lat,
    lng,
    detailCache,
    isOnline
  );

  const heroUrl =
    detail?.photo_large_url ?? detail?.photo_medium_url ?? card.photo_url ?? null;
  const commonName = detail?.common_name ?? card.common_name;
  const scientificName = detail?.name ?? card.name;
  const establishment = detail?.establishment_means ?? card.establishment_means ?? null;
  const iucn = detail?.iucn_code ?? card.iucn_code ?? null;
  const showCavityBadge = isCavityNester(card.id);
  const nearbyCount = card.nearby_count ?? null;
  const family = detail?.family ?? null;
  const summary = detail?.wikipedia_summary ?? null;
  const wikipediaUrl = detail?.wikipedia_url ?? card.wikipedia_url ?? null;
  const observations = detail?.observations_count ?? card.observations_count ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-forest-dark hover:underline"
        aria-label="Back to species grid"
      >
        &larr; Back
      </button>

      <div className="overflow-hidden rounded-xl bg-sage-light" style={{ height: 260 }}>
        {heroUrl && (
          <img src={heroUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div>
        <h2 className="font-heading text-xl font-semibold text-forest-dark">
          {commonName}
        </h2>
        <p className="italic text-sm text-sage">{scientificName}</p>
      </div>

      <SpeciesTaxonomySection
        native={establishment === 'native'}
        cavityNester={showCavityBadge}
        iucnStatus={iucn}
        summary={summary}
      />

      {loading && <p className="text-xs text-sage">Loading details...</p>}
      {error && <p className="text-xs text-sage">Details unavailable right now.</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-sage-light px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-sage">IUCN</div>
          <div className="font-heading text-sm text-forest-dark">{iucn ?? '—'}</div>
        </div>
        <div className="rounded-lg bg-sage-light px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-sage">Observations</div>
          <div className="font-heading text-sm text-forest-dark">
            {observations.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-sage-light px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-sage">Family</div>
          <div className="font-heading text-sm text-forest-dark">{family ?? '—'}</div>
        </div>
        <div className="rounded-lg bg-sage-light px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-sage">Nearby</div>
          <div className="font-heading text-sm text-forest-dark">
            {nearbyCount !== null ? nearbyCount.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {detail?.ancestry && detail.ancestry.length > 0 && (
        <p className="font-mono text-[11px] text-sage">
          {detail.ancestry.map((a) => a.name).join(' › ')}
        </p>
      )}

      {nearbyCount !== null && nearbyCount > 0 && (
        <p className="text-xs text-forest">
          {nearbyCount.toLocaleString()} nearby observations.
        </p>
      )}

      {wikipediaUrl && (
        <a
          href={wikipediaUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-forest-dark underline"
        >
          Read on Wikipedia
        </a>
      )}

      <div className="sticky bottom-0 -mx-4 bg-white px-4 pb-2 pt-3">
        <button
          type="button"
          onClick={onToggle}
          className="btn-primary w-full"
          aria-pressed={isStaged}
        >
          {isStaged ? 'Remove from this update' : 'Add to this update'}
        </button>
      </div>
    </div>
  );
}
