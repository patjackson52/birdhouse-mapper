import { Tag } from './Tag';

export type SpeciesRowItem = {
  external_id: number;
  common_name: string;
  scientific_name: string;
  photo_url: string | null;
  native: boolean | null;
  cavity_nester: boolean | null;
};

export function SpeciesRow({ species, onOpen }: { species: SpeciesRowItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-forest-border-soft bg-white p-[10px] text-left font-body hover:bg-parchment"
    >
      <img
        src={species.photo_url ?? ''}
        alt=""
        className="h-12 w-12 shrink-0 rounded-[10px] bg-sage-light object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-tight">{species.common_name}</div>
        <div className="mt-[2px] text-[12px] italic leading-tight text-sage">{species.scientific_name}</div>
        <div className="mt-[5px] flex gap-[5px]">
          <Tag kind={species.native ? 'native' : 'intro'}>{species.native ? 'Native' : 'Introduced'}</Tag>
          {species.cavity_nester && <Tag kind="cavity">Cavity</Tag>}
        </div>
      </div>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sage" aria-hidden>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
