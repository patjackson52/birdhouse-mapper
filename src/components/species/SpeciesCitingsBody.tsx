'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { SpeciesDetail } from '@/lib/species/getSpeciesDetail';
import {
  getSpeciesCitingsAtItem,
  getSpeciesCitingsAtProperty,
  getSpeciesCitingsAtOrg,
} from '@/app/species/[id]/actions';
import { SpeciesTaxonomySection } from './SpeciesTaxonomySection';

type Scope = 'item' | 'property' | 'org';

function parseFrom(fromUrl: string | null): { slug: string | null; itemId: string | null } {
  if (!fromUrl) return { slug: null, itemId: null };
  const m = fromUrl.match(/^\/p\/([^/]+)\/item\/([^/?#]+)/);
  return { slug: m?.[1] ?? null, itemId: m?.[2] ?? null };
}

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SpeciesCitingsBody({
  species,
  fromUrl,
  orgId,
  propertyId,
  propertyName,
  orgName,
}: {
  species: SpeciesDetail;
  fromUrl: string | null;
  orgId: string | null;
  propertyId?: string | null;
  propertyName: string;
  orgName: string;
}) {
  const { slug, itemId } = parseFrom(fromUrl);
  const hasItem = itemId !== null;
  const initialScope: Scope = hasItem ? 'item' : propertyId ? 'property' : 'org';
  const [scope, setScope] = useState<Scope>(initialScope);

  const itemQuery = useQuery({
    queryKey: ['species-citings', 'item', species.external_id, itemId],
    queryFn: () => getSpeciesCitingsAtItem(species.external_id, itemId!),
    enabled: scope === 'item' && hasItem,
  });

  const propertyQuery = useQuery({
    queryKey: ['species-citings', 'property', species.external_id, propertyId, itemId],
    queryFn: () => getSpeciesCitingsAtProperty(species.external_id, propertyId!, itemId ?? ''),
    enabled: scope === 'property' && !!propertyId,
  });

  const orgQuery = useQuery({
    queryKey: ['species-citings', 'org', species.external_id, orgId, propertyId],
    queryFn: () => getSpeciesCitingsAtOrg(species.external_id, orgId!, propertyId ?? ''),
    enabled: scope === 'org' && !!orgId,
  });

  const tabs = useMemo(
    () => [
      hasItem ? { id: 'item' as const, label: 'This item' } : null,
      { id: 'property' as const, label: propertyName },
      { id: 'org' as const, label: `All of ${orgName.split(' ')[0]}` },
    ].filter((t): t is { id: Scope; label: string } => t !== null),
    [hasItem, propertyName, orgName],
  );

  return (
    <div className="flex-1 overflow-auto px-[18px] pb-20 pt-4 font-body">
      <SpeciesTaxonomySection
        native={species.native}
        cavityNester={species.cavity_nester}
        iucnStatus={species.iucn_status}
        summary={species.summary}
      />
      <div className="mb-3 flex gap-[2px] rounded-[10px] border border-forest-border-soft bg-sage-light p-[3px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setScope(t.id)}
            className={[
              'flex-1 whitespace-nowrap overflow-hidden text-ellipsis rounded-[7px] px-1 py-[7px] text-[11.5px]',
              scope === t.id ? 'bg-white font-semibold text-forest-dark shadow-sm' : 'font-medium text-sage',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'item' && hasItem && (
        <div className="rounded-xl border border-forest-border-soft bg-parchment px-4 py-[14px]">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.7px] text-sage">Seen on this item</div>
          <div className="font-heading text-[28px] font-medium leading-none text-forest-dark">
            {itemQuery.data?.count ?? 0} <span className="font-body text-[14px] font-normal text-sage">observations</span>
          </div>
          <div className="mt-[6px] text-[12.5px] text-sage">
            Most recent · {itemQuery.data?.lastObserved ? fmtShort(itemQuery.data.lastObserved) : '—'}
          </div>
        </div>
      )}

      {scope === 'property' && propertyQuery.data && (
        <>
          <div className="mb-[10px] flex items-baseline gap-2">
            <div className="font-heading text-[24px] font-medium leading-none text-forest-dark">{propertyQuery.data.total.count}</div>
            <div className="text-[13px] text-sage">observations · {propertyQuery.data.total.itemCount} items at {propertyName}</div>
          </div>
          <div className="flex flex-col gap-[6px]">
            {propertyQuery.data.items.map((i) => (
              <Link
                key={i.item_id}
                href={`/p/${slug}/item/${i.item_id}`}
                className={`flex items-center gap-[10px] rounded-[10px] px-3 py-[10px] ${i.current ? 'border border-forest bg-forest/5' : 'border border-forest-border-soft bg-white'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px] text-[13.5px] font-semibold">
                    {i.item_name}
                    {i.current && <span className="rounded-[3px] bg-forest px-[5px] py-[1px] text-[9px] font-bold tracking-[0.3px] text-white">HERE</span>}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-sage">Last {fmtShort(i.last)}</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-[18px] font-medium leading-none text-forest-dark">{i.count}</div>
                  <div className="text-[10px] tracking-[0.4px] text-sage">obs</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {scope === 'org' && orgQuery.data && (
        <>
          <div className="mb-3 flex gap-[10px]">
            {[
              { v: orgQuery.data.total.count, l: 'Observations' },
              { v: orgQuery.data.total.propertyCount, l: 'Properties' },
              { v: orgQuery.data.total.itemCount, l: 'Items' },
            ].map((s) => (
              <div key={s.l} className="flex-1 rounded-[10px] border border-forest-border-soft bg-parchment px-3 py-[10px]">
                <div className="font-heading text-[22px] font-medium leading-none text-forest-dark">{s.v}</div>
                <div className="mt-[3px] text-[10.5px] tracking-[0.5px] text-sage">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.7px] text-sage">By property</div>
          <div className="flex flex-col gap-[6px]">
            {orgQuery.data.properties.map((p) => (
              <Link
                key={p.property_id}
                href={`/p/${slug}`}
                className={`flex items-center gap-[10px] rounded-[10px] px-3 py-[10px] ${p.current ? 'border border-forest bg-forest/5' : 'border border-forest-border-soft bg-white'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[6px] text-[13.5px] font-semibold">
                    {p.property_name}
                    {p.current && <span className="rounded-[3px] bg-forest px-[5px] py-[1px] text-[9px] font-bold tracking-[0.3px] text-white">CURRENT</span>}
                  </div>
                  <div className="mt-[2px] text-[11.5px] text-sage">{p.item_count} items · last {fmtShort(p.last)}</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-[18px] font-medium leading-none text-forest-dark">{p.count}</div>
                  <div className="text-[10px] tracking-[0.4px] text-sage">obs</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
