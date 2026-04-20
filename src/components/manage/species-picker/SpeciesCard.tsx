'use client';

import type { ReactElement } from 'react';
import type { SpeciesResult } from '@/lib/types';
import { isCavityNester } from '@/lib/species/cavity-nesters';

interface SpeciesCardProps {
  card: SpeciesResult;
  selected: boolean;
  onTap: () => void;
}

export default function SpeciesCard({ card, selected, onTap }: SpeciesCardProps): ReactElement {
  const showIntroduced = card.establishment_means === 'introduced';
  const showCavityBadge = isCavityNester(card.id);

  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      aria-label={`View details for ${card.common_name}`}
      className={[
        'relative block w-full overflow-hidden rounded-xl bg-white text-left transition-shadow',
        selected
          ? 'ring-[3px] ring-[var(--color-primary)] shadow-md'
          : 'ring-1 ring-sage-light shadow-sm hover:shadow-md',
      ].join(' ')}
    >
      <div className="relative aspect-[16/10] bg-sage-light">
        {card.photo_url ? (
          <img
            src={card.photo_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        {showIntroduced && (
          <span
            className="absolute left-2 top-2 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium text-forest-dark"
            data-testid="introduced-pill"
          >
            Introduced
          </span>
        )}
        {selected && (
          <span
            aria-hidden
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white"
            data-testid="selected-check"
          >
            ✓
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="font-heading text-sm font-semibold text-forest-dark">
          {card.common_name}
        </div>
        <div className="italic text-xs text-sage">{card.name}</div>
        {typeof card.nearby_count === 'number' && card.nearby_count > 0 && (
          <div className="mt-1 text-[11px] text-forest">
            {card.nearby_count.toLocaleString()} nearby
          </div>
        )}
        {showCavityBadge && (
          <div className="mt-1 text-[10px] uppercase tracking-wide text-sage">
            Cavity nester
          </div>
        )}
      </div>
    </button>
  );
}
