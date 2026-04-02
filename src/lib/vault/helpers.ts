import { createClient } from '@/lib/supabase/client';
import type { VaultItem } from './types';

/**
 * Get the URL for a vault item.
 * - Public items: returns CDN-cacheable public URL (sync)
 * - Private items: returns a signed URL with 1-hour expiry (async)
 */
export function getVaultUrl(item: VaultItem): string | Promise<string> {
  const supabase = createClient();

  if (item.visibility === 'public') {
    return supabase.storage
      .from(item.storage_bucket)
      .getPublicUrl(item.storage_path).data.publicUrl;
  }

  return supabase.storage
    .from(item.storage_bucket)
    .createSignedUrl(item.storage_path, 3600)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${error?.message ?? 'unknown'}`);
      }
      return data.signedUrl;
    });
}
