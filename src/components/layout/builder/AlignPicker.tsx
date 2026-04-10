'use client';

import type { BlockAlign } from '@/lib/layout/types-v2';

interface Props {
  value: BlockAlign | undefined;
  onChange: (align: BlockAlign) => void;
}

const OPTIONS: { value: BlockAlign; label: string }[] = [
  { value: 'start', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'Right' },
];

export default function AlignPicker({ value, onChange }: Props) {
  const active = value ?? 'start';

  return (
    <div>
      <label className="label">Align</label>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === opt.value ? 'bg-forest text-white' : 'bg-white border border-sage-light'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
