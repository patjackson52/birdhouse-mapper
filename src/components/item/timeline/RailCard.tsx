import type { EnrichedUpdate } from '@/lib/types';
import { Attribution } from './Attribution';
import { SpeciesAvatar } from '@/components/species/SpeciesAvatar';

function fmtRel(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 86_400_000;
  if (diff < 1) return `${Math.max(1, Math.round(diff * 24))}h ago`;
  if (diff < 7) return `${Math.round(diff)}d ago`;
  if (diff < 30) return `${Math.round(diff / 7)}w ago`;
  const dt = new Date(iso);
  if (diff < 365) return dt.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RailCard({
  update,
  onOpen,
  isLast,
}: {
  update: EnrichedUpdate;
  onOpen: () => void;
  isLast: boolean;
}) {
  const firstPhoto = update.photos[0];
  const speciesStack = update.species.slice(0, 3);
  return (
    <div className="relative pl-7" style={{ paddingBottom: isLast ? 0 : 14 }}>
      {!isLast && (
        <div
          data-testid="rail-line"
          className="absolute left-[10px] top-5 bottom-0 w-[1.5px] bg-forest-border-soft"
        />
      )}
      <div className="absolute left-1 top-[6px] h-[14px] w-[14px] rounded-full border-[2.5px] border-forest bg-white ring-[3px] ring-parchment" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full gap-3 rounded-[14px] border border-forest-border-soft bg-white p-3 text-left font-body"
      >
        {firstPhoto ? (
          <div className="h-[66px] w-[66px] shrink-0 overflow-hidden rounded-[10px] bg-sage-light">
            <img src={(firstPhoto as any).url ?? ''} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[10px] bg-sage-light text-[26px]">
            {update.update_type.icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-[6px]">
            <span className="text-[13px] font-semibold text-forest-dark">{update.update_type.name}</span>
            <span className="font-mono text-[11px] text-sage">{fmtRel(update.update_date)}</span>
          </div>
          {update.content && (
            <p className="mt-[3px] line-clamp-2 text-[13px] leading-[1.4]">{update.content}</p>
          )}
          <div className="mt-[6px] flex items-center gap-2">
            <Attribution update={update} compact />
            {speciesStack.length > 0 && (
              <div className="ml-auto flex">
                {speciesStack.map((s, i) => (
                  <div key={s.external_id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <SpeciesAvatar photoUrl={s.photo_url} commonName={s.common_name} size={20} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
