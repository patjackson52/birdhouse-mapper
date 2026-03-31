'use client';

import { createClient } from '@/lib/supabase/client';

export interface AssetItem {
  id: string;
  publicUrl: string;
  fileName: string;
}

/** Fetch image assets from the landing-assets Supabase bucket */
export async function fetchLandingAssets(): Promise<AssetItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('landing-assets')
    .list('images', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error || !data) return [];

  return data
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => {
      const { data: { publicUrl } } = supabase.storage.from('landing-assets').getPublicUrl(`images/${f.name}`);
      return {
        id: f.id ?? f.name,
        publicUrl,
        fileName: f.name,
      };
    });
}
