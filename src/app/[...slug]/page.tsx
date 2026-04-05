import { notFound } from 'next/navigation';
import { getConfig } from '@/lib/config/server';
import { PuckPageRenderer } from '@/components/puck/PuckPageRenderer';
import { PreviewReloadListener } from '@/components/puck/PreviewReloadListener';
import type { Data } from '@puckeditor/core';

interface CatchAllPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatchAllPage({ params, searchParams }: CatchAllPageProps) {
  const { slug: segments } = await params;
  const resolvedSearchParams = await searchParams;
  const path = `/${segments.join('/')}`;
  const isPreview = resolvedSearchParams?.preview === 'true';

  const config = await getConfig();

  const pageData = isPreview
    ? (config.puckPagesDraft?.[path] ?? config.puckPages?.[path])
    : config.puckPages?.[path];

  if (!pageData) {
    notFound();
  }

  return (
    <main className="pb-20 md:pb-0">
      {isPreview && (
        <>
          <PreviewReloadListener />
          <div className="bg-yellow-100 px-4 py-2 text-center text-sm text-yellow-800">
            Preview Mode — This is a draft and not yet published.
          </div>
        </>
      )}
      <PuckPageRenderer data={pageData as Data} />
    </main>
  );
}
