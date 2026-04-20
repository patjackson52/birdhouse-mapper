'use client';

import type { ReactElement } from 'react';

interface SpeciesPillProps {
  name: string;
  photoUrl: string | null;
  onRemove: () => void;
}

export default function SpeciesPill({ name, photoUrl, onRemove }: SpeciesPillProps): ReactElement {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-forest/10 px-2.5 py-1 text-xs text-forest-dark">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          className="h-[26px] w-[26px] rounded-full object-cover"
        />
      ) : (
        <span className="h-[26px] w-[26px] rounded-full bg-sage-light" aria-hidden />
      )}
      <span className="font-medium">{name}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="ml-0.5 text-sage hover:text-red-600"
      >
        &times;
      </button>
    </span>
  );
}
