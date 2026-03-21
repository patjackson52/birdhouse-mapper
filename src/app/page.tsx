import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config/server';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { HomeMapView } from '@/components/map/HomeMapView';

interface HomePageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
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
