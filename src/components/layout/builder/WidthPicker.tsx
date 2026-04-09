'use client';

import type { FractionalWidth } from '@/lib/layout/types-v2';

interface Props {
  value: FractionalWidth | undefined;
  onChange: (width: FractionalWidth) => void;
}

const OPTIONS: { value: FractionalWidth; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/3', label: '1/3' },
  { value: '1/2', label: '1/2' },
  { value: '2/3', label: '2/3' },
  { value: '3/4', label: '3/4' },
];

export default function WidthPicker({ value, onChange }: Props) {
  return (
    <div>
      <label className="label">Width</label>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value === opt.value ? 'bg-forest text-white' : 'bg-white border border-sage-light'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
