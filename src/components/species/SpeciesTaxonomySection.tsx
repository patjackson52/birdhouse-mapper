import { Tag } from './Tag';

export function SpeciesTaxonomySection({
  native,
  cavityNester,
  iucnStatus,
  summary,
}: {
  native: boolean | null;
  cavityNester: boolean | null;
  iucnStatus: string | null;
  summary: string | null;
}) {
  return (
    <>
      <div className="mb-[14px] flex flex-wrap gap-[6px]">
        <Tag kind={native ? 'native' : 'intro'}>{native ? 'Native' : 'Introduced'}</Tag>
        {cavityNester && <Tag kind="cavity">Cavity nester</Tag>}
        {iucnStatus && <Tag kind="cavity">IUCN {iucnStatus}</Tag>}
      </div>
      {summary && (
        <p className="mb-4 text-[14px] leading-[1.55] font-body">{summary}</p>
      )}
    </>
  );
}
