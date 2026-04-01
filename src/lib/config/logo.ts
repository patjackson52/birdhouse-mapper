import { createClient } from '@/lib/supabase/client';

export type LogoVariant = 'original.png' | 'icon-192.png' | 'icon-512.png' | 'icon-512-maskable.png' | 'favicon-32.png';

const DEFAULT_LOGO_PATH = '/defaults/logos/fieldmapper.png';

/**
 * Build the full public URL for a logo variant stored in the branding bucket.
 * If basePath is null, returns the default logo path.
 */
export function getLogoUrl(basePath: string | null, variant: LogoVariant): string {
  if (!basePath) return DEFAULT_LOGO_PATH;

  const supabase = createClient();
  return supabase.storage.from('branding').getPublicUrl(`${basePath}/${variant}`).data.publicUrl;
}
