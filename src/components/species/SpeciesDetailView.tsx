'use client';

import { useEffect, useState } from 'react';
import { getSpeciesDetail, type SpeciesDetail } from '@/lib/species/getSpeciesDetail';
import { SpeciesCitingsBody } from './SpeciesCitingsBody';

export function SpeciesDetailView({
  externalId,
  fromUrl,
  orgId,
  propertyId,
  propertyName,
  orgName,
  onBack,
}: {
  externalId: number;
  fromUrl: string | null;
  orgId: string | null;
  propertyId: string | null;
  propertyName: string;
  orgName: string;
  onBack?: () => void;
}) {
  const [species, setSpecies] = useState<SpeciesDetail | null>(null);
  useEffect(() => { getSpeciesDetail(externalId).then(setSpecies).catch(() => setSpecies(null)); }, [externalId]);

  if (!species) return <div className="p-6 text-sm text-sage">Loading species…</div>;

  return (
    <>
      <div className="relative h-[280px] shrink-0 bg-sage-light">
        <img src={species.large_photo_url ?? species.photo_url ?? ''} alt="" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-forest-dark/25 via-transparent to-forest-dark/70" />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div className="absolute inset-x-4 bottom-[14px] text-white">
          <h2 className="font-heading text-[26px] font-medium leading-tight">{species.common_name}</h2>
          <div className="mt-[3px] text-[13px] italic opacity-90">{species.scientific_name}</div>
        </div>
      </div>
      <SpeciesCitingsBody
        species={species}
        fromUrl={fromUrl}
        orgId={orgId}
        propertyId={propertyId}
        propertyName={propertyName}
        orgName={orgName}
      />
    </>
  );
}
