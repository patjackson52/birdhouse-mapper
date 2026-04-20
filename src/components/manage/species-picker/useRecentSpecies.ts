'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SpeciesResult } from '@/lib/types';

interface EntityRow {
  id: string;
  name: string;
  description: string | null;
  external_id: string | null;
  custom_field_values: Record<string, unknown> | null;
  updated_at: string;
}

const RECENT_LIMIT = 30;

export interface RecentSpeciesEntry {
  entityId: string;
  card: SpeciesResult;
}

export function useRecentSpecies(
  orgId: string,
  entityTypeId: string,
  enabled: boolean
): { entries: RecentSpeciesEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<RecentSpeciesEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('entities')
        .select('id, name, description, external_id, custom_field_values, updated_at')
        .eq('org_id', orgId)
        .eq('entity_type_id', entityTypeId)
        .order('updated_at', { ascending: false })
        .limit(RECENT_LIMIT);

      if (cancelled) return;

      const rows = (data ?? []) as EntityRow[];
      const mapped: RecentSpeciesEntry[] = rows
        .filter((r) => r.external_id !== null)
        .map((r) => {
          const taxonId = Number(r.external_id);
          const cfv = r.custom_field_values ?? {};
          const photoUrl = typeof cfv.photo_url === 'string' ? (cfv.photo_url as string) : null;
          const photoSquare =
            typeof cfv.photo_square_url === 'string' ? (cfv.photo_square_url as string) : null;
          const scientific = typeof cfv.scientific_name === 'string'
            ? (cfv.scientific_name as string)
            : (r.description ?? '');
          const card: SpeciesResult = {
            id: taxonId,
            name: scientific,
            common_name: r.name,
            photo_url: photoUrl,
            photo_square_url: photoSquare,
            rank: 'species',
            observations_count: 0,
            wikipedia_url:
              typeof cfv.wikipedia_url === 'string' ? (cfv.wikipedia_url as string) : null,
          };
          return { entityId: r.id, card };
        });

      setEntries(mapped);
      setLoading(false);
    };

    void run().catch(() => {
      if (!cancelled) {
        setEntries([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [orgId, entityTypeId, enabled]);

  return { entries, loading };
}
