'use client';

import type { SpacingPreset } from '@/lib/layout/types';

interface Props {
  value: SpacingPreset;
  onChange: (value: SpacingPreset) => void;
}

const options: { value: SpacingPreset; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Dense, data-heavy' },
  { value: 'comfortable', label: 'Comfortable', description: 'Balanced' },
  { value: 'spacious', label: 'Spacious', description: 'Airy, photo-forward' },
];

export default function SpacingPicker({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-2 rounded-md text-xs font-medium text-center transition-colors ${
            value === opt.value
              ? 'bg-forest text-white'
              : 'bg-white border border-sage-light text-forest-dark hover:bg-sage-light/50'
          }`}
          title={opt.description}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
