import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const STATS_CACHE_TAG = 'landing-stats';

interface StatItem { label: string; value: string; }

function createStatsClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const fetchLandingStats = unstable_cache(
  async (): Promise<StatItem[] | null> => {
    const supabase = createStatsClient();
    const [itemRes, typeRes, updateRes, speciesRes] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).neq('status', 'removed'),
      supabase.from('item_types').select('id', { count: 'exact', head: true }),
      supabase.from('item_updates').select('id', { count: 'exact', head: true }),
      supabase.from('species').select('id', { count: 'exact', head: true }),
    ]);
    const stats: StatItem[] = [];
    if (itemRes.count && itemRes.count > 0) stats.push({ label: 'Items', value: String(itemRes.count) });
    if (typeRes.count && typeRes.count > 0) stats.push({ label: 'Types', value: String(typeRes.count) });
    if (updateRes.count && updateRes.count > 0) stats.push({ label: 'Updates', value: String(updateRes.count) });
    if (speciesRes.count && speciesRes.count > 0) stats.push({ label: 'Species', value: String(speciesRes.count) });
    if (stats.length < 2) return null;
    return stats;
  },
  [STATS_CACHE_TAG],
  { revalidate: 60, tags: [STATS_CACHE_TAG] }
);
