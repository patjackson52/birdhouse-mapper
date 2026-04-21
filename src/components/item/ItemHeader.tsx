import type { Item, ItemHeaderStats } from '@/lib/types';

export function ItemHeader({
  item,
  location,
  photoUrl,
  stats,
  onBack,
  onShare,
}: {
  item: Item & { item_type?: { name?: string } };
  location: string | null;
  photoUrl: string | null;
  stats: ItemHeaderStats;
  onBack: () => void;
  onShare: () => void;
}) {
  const cells = [
    { v: stats.updatesCount, l: 'Updates' },
    { v: stats.speciesCount, l: 'Species' },
    { v: stats.contributorsCount, l: 'People' },
  ];
  return (
    <div>
      <div className="relative h-[180px] bg-sage-light">
        {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-forest-dark/65" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="absolute right-[14px] top-[58px] flex h-9 w-9 items-center justify-center rounded-full bg-white/92 backdrop-blur"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-dark"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
        </button>
        <div className="absolute inset-x-4 bottom-3 text-white">
          {location && (
            <div className="flex items-center gap-[5px] font-mono text-[11px] tracking-[0.5px] opacity-90">
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-8 7-13a7 7 0 10-14 0c0 5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>
              {location}
            </div>
          )}
          <h1 className="mt-[3px] font-heading text-[26px] font-medium leading-tight tracking-[-0.3px]">{item.name}</h1>
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-forest-border bg-white">
        {cells.map((c, i) => (
          <div
            key={c.l}
            className={`px-1 py-3 text-center ${i < 2 ? 'border-r border-forest-border-soft' : ''}`}
          >
            <div className="font-heading text-[20px] font-medium leading-none text-forest-dark">{c.v}</div>
            <div className="mt-[3px] text-[10px] uppercase tracking-[0.6px] text-sage">{c.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
