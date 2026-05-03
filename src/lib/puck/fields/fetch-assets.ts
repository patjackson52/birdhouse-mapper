'use client';

import { createClient } from '@/lib/supabase/client';

export interface AssetItem {
  id: string;
  publicUrl: string;
  fileName: string;
}

/** Fetch image assets from the vault for the Puck editor */
export async function fetchImageAssets(): Promise<AssetItem[]> {
  const supabase = createClient();

  // Get org_id from membership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!membership) return [];

  // Query vault items that are images (photos + branding) and public
  const { data, error } = await supabase
    .from('vault_items')
    .select('id, storage_bucket, storage_path, file_name')
    .eq('org_id', membership.org_id)
    .in('category', ['photo', 'branding'])
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((item: any) => {
    const { data: { publicUrl } } = supabase.storage
      .from(item.storage_bucket)
      .getPublicUrl(item.storage_path);
    return {
      id: item.id,
      publicUrl,
      fileName: item.file_name,
    };
  });
}
