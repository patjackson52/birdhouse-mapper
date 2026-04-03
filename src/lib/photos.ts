import { createClient } from '@/lib/supabase/client';

export function getPhotoUrl(storagePath: string): string {
  const supabase = createClient();
  return supabase.storage.from('vault-public').getPublicUrl(storagePath).data.publicUrl;
}
