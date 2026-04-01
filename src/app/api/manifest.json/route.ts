import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/server';
import { getLogoUrlServer } from '@/lib/config/logo-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const config = await getConfig();

  const appName = config.propertyName || config.siteName || 'FieldMapper';

  const manifest = {
    name: appName,
    short_name: appName.slice(0, 12),
    description: config.tagline || 'Field mapping for conservation teams',
    start_url: '/map',
    display: 'standalone' as const,
    orientation: 'any' as const,
    theme_color: '#2563eb',
    background_color: '#ffffff',
    icons: [
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-512-maskable.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
