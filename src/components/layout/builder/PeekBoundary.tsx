'use client';

interface Props {
  peekBlockCount: number;
  totalBlocks: number;
  onChange: (count: number) => void;
}

export default function PeekBoundary({ peekBlockCount, totalBlocks, onChange }: Props) {
  if (totalBlocks <= 1) return null;

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 border-t-2 border-dashed border-forest/30" />
      <span className="text-[10px] font-medium text-forest/60 whitespace-nowrap">
        Visible on first tap
      </span>
      <select
        value={peekBlockCount}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-xs border border-sage-light rounded px-1 py-0.5"
      >
        {Array.from({ length: totalBlocks }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n} block{n > 1 ? 's' : ''}</option>
        ))}
      </select>
      <div className="flex-1 border-t-2 border-dashed border-forest/30" />
    </div>
  );
}
