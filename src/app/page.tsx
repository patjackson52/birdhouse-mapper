import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getConfig } from '@/lib/config/server';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { HomeMapView } from '@/components/map/HomeMapView';
import { PlatformLanding } from '@/components/platform/PlatformLanding';
import PuckRendererWrapper from '@/components/landing/PuckRendererWrapper';
import { puckConfig } from '@/lib/config/puck-config';

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

  // Forward any query params to /map (preserves deep links like ?item=123)
  if (Object.keys(searchParams).length > 0) {
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

  const landingPage = config.landingPage;

  if (landingPage?.enabled) {
    // Puck editor path
    if (landingPage.editorType === 'puck' && landingPage.puckData) {
      return (
        <main className="pb-20 md:pb-0">
          <PuckRendererWrapper data={landingPage.puckData} config={puckConfig} />
        </main>
      );
    }

    // Block editor path (existing)
    if (landingPage.blocks && landingPage.blocks.length > 0) {
      return (
        <main className="pb-20 md:pb-0">
          <LandingRenderer blocks={landingPage.blocks} />
        </main>
      );
    }
  }

  // Fallback — render map (current behavior)
  return <HomeMapView />;
}
