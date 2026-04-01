import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const config = await getConfig();

  const manifest = {
    name: config.siteName || 'BirdhouseMapper',
    short_name: config.siteName?.slice(0, 12) || 'BirdMapper',
    description: config.tagline || 'Field mapping for conservation teams',
    start_url: '/map',
    display: 'standalone' as const,
    orientation: 'any' as const,
    theme_color: '#2563eb',
    background_color: '#ffffff',
    icons: [
      {
        src: config.logoUrl || '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: config.logoUrl || '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: config.logoUrl || '/icons/icon-512-maskable.png',
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
