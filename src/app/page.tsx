import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getConfig } from '@/lib/config/server';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { HomeMapView } from '@/components/map/HomeMapView';
import { PlatformLanding } from '@/components/platform/PlatformLanding';
import { PuckPageRenderer } from '@/components/puck/PuckPageRenderer';
import type { Data } from '@puckeditor/core';

interface HomePageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const headersList = await headers();
  const isPlatform = headersList.get('x-tenant-source') === 'platform';

  // Platform context — render platform landing page
  if (isPlatform) {
    return <PlatformLanding />;
  }

  // Org context — existing behavior
  const config = await getConfig();

  // Check for preview mode
  const isPreview = searchParams?.preview === 'true';

  // Forward non-preview query params to /map (preserves deep links like ?item=123)
  if (!isPreview && Object.keys(searchParams).length > 0) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === 'string') {
        query.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => query.append(key, v));
      }
    }
    redirect(`/map?${query.toString()}`);
  }

  // Puck landing page (new system) — takes priority over legacy
  // In preview mode, use draft data if available
  const puckLandingData = isPreview
    ? (config.puckPagesDraft?.['/'] ?? config.puckPages?.['/'])
    : config.puckPages?.['/'];
  if (puckLandingData) {
    return (
      <main className="pb-20 md:pb-0">
        {isPreview && (
          <div className="bg-yellow-100 px-4 py-2 text-center text-sm text-yellow-800">
            Preview Mode — This is a draft and not yet published.
          </div>
        )}
        <PuckPageRenderer data={puckLandingData as Data} />
      </main>
    );
  }

  // Landing page enabled — render blocks
  if (config.landingPage?.enabled && config.landingPage.blocks.length > 0) {
    return (
      <main className="pb-20 md:pb-0">
        <LandingRenderer blocks={config.landingPage.blocks} />
      </main>
    );
  }

  // Fallback — render map (current behavior)
  return <HomeMapView />;
}
