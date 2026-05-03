import { createClient } from '@/lib/supabase/server';

export type LogoVariant =
  | 'original.png'
  | 'icon-192.png'
  | 'icon-512.png'
  | 'icon-512-maskable.png'
  | 'favicon-32.png'
  | 'apple-touch-icon-180.png';

const DEFAULT_ICONS: Record<LogoVariant, string> = {
  'icon-192.png': '/defaults/logos/icon-192.png',
  'icon-512.png': '/defaults/logos/icon-512.png',
  'icon-512-maskable.png': '/defaults/logos/icon-512-maskable.png',
  'favicon-32.png': '/defaults/logos/favicon-32.png',
  'apple-touch-icon-180.png': '/defaults/logos/icon-192.png', // iOS downscales 192→180; reuse existing default asset
  'original.png': '/defaults/logos/fieldmapper.png',
};

/**
 * Build the full public URL for a logo variant (server-side).
 * Falls back to default icons shipped as static assets.
 */
export function getLogoUrlServer(basePath: string | null, variant: LogoVariant): string {
  if (!basePath) return DEFAULT_ICONS[variant] ?? DEFAULT_ICONS['original.png'];

  const supabase = createClient();
  return supabase.storage.from('vault-public').getPublicUrl(`${basePath}/${variant}`).data.publicUrl;
}
