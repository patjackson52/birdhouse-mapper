'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  SpeciesCitingsItem,
  SpeciesCitingsProperty,
  SpeciesCitingsOrg,
} from '@/lib/types';

type Row = {
  observed_on: string;
  item_id: string;
  property_id: string;
};

export async function getSpeciesCitingsAtItem(
  speciesId: number,
  itemId: string,
): Promise<SpeciesCitingsItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('species_sightings_v')
    .select('observed_on')
    .eq('species_id', speciesId)
    .eq('item_id', itemId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<Row, 'observed_on'>[];
  const count = rows.length;
  const lastObserved = rows.reduce<string | null>((acc, r) => {
    if (!acc || r.observed_on > acc) return r.observed_on;
    return acc;
  }, null);
  return { count, lastObserved };
}

export async function getSpeciesCitingsAtProperty(
  speciesId: number,
  propertyId: string,
  currentItemId: string,
): Promise<SpeciesCitingsProperty> {
  const supabase = createClient();
  const { data: sightings, error } = await supabase
    .from('species_sightings_v')
    .select('item_id, observed_on')
    .eq('species_id', speciesId)
    .eq('property_id', propertyId);
  if (error) throw new Error(error.message);

  const byItem = new Map<string, { count: number; last: string }>();
  for (const r of (sightings ?? []) as Pick<Row, 'item_id' | 'observed_on'>[]) {
    const cur = byItem.get(r.item_id);
    if (!cur) byItem.set(r.item_id, { count: 1, last: r.observed_on });
    else {
      cur.count += 1;
      if (r.observed_on > cur.last) cur.last = r.observed_on;
    }
  }

  const itemIds = Array.from(byItem.keys());
  const names = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: items, error: ierr } = await supabase
      .from('items')
      .select('id, name')
      .in('id', itemIds);
    if (ierr) throw new Error(ierr.message);
    for (const it of (items ?? []) as { id: string; name: string }[]) names.set(it.id, it.name);
  }

  const items = itemIds.map((id) => ({
    item_id: id,
    item_name: names.get(id) ?? 'Unknown',
    count: byItem.get(id)!.count,
    last: byItem.get(id)!.last,
    current: id === currentItemId,
  }));
  items.sort((a, b) => b.count - a.count);
  const totalCount = items.reduce((s, i) => s + i.count, 0);
  return {
    total: { count: totalCount, itemCount: items.length },
    items,
  };
}

export async function getSpeciesCitingsAtOrg(
  speciesId: number,
  orgId: string,
  currentPropertyId: string,
): Promise<SpeciesCitingsOrg> {
  const supabase = createClient();
  const { data: sightings, error } = await supabase
    .from('species_sightings_v')
    .select('property_id, item_id, observed_on')
    .eq('species_id', speciesId)
    .eq('org_id', orgId);
  if (error) throw new Error(error.message);

  const byProp = new Map<string, { count: number; last: string; items: Set<string> }>();
  for (const r of (sightings ?? []) as Row[]) {
    const cur = byProp.get(r.property_id);
    if (!cur) byProp.set(r.property_id, { count: 1, last: r.observed_on, items: new Set([r.item_id]) });
    else {
      cur.count += 1;
      if (r.observed_on > cur.last) cur.last = r.observed_on;
      cur.items.add(r.item_id);
    }
  }

  const propIds = Array.from(byProp.keys());
  const names = new Map<string, string>();
  if (propIds.length > 0) {
    const { data: props, error: perr } = await supabase
      .from('properties')
      .select('id, name')
      .in('id', propIds);
    if (perr) throw new Error(perr.message);
    for (const p of (props ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }

  const properties = propIds.map((id) => ({
    property_id: id,
    property_name: names.get(id) ?? 'Unknown',
    item_count: byProp.get(id)!.items.size,
    count: byProp.get(id)!.count,
    last: byProp.get(id)!.last,
    current: id === currentPropertyId,
  }));
  properties.sort((a, b) => b.count - a.count);

  const itemCount = Array.from(byProp.values()).reduce((s, p) => s + p.items.size, 0);
  return {
    total: {
      count: properties.reduce((s, p) => s + p.count, 0),
      propertyCount: properties.length,
      itemCount,
    },
    properties,
  };
}
