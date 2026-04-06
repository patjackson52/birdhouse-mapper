import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckPageEditor } from '@/components/puck/PuckPageEditor';
import Link from 'next/link';
import type { Data } from '@puckeditor/core';

const emptyPageData: Data = {
  root: { props: {} },
  content: [],
};

interface PageEditorProps {
  params: Promise<{ slug: string; path: string[] }>;
}

export default async function SiteBuilderPageEditor({ params }: PageEditorProps) {
  const { slug, path: pathSegments } = await params;

  const pagePath = pathSegments[0] === 'home'
    ? '/'
    : `/${pathSegments.join('/')}`;

  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const puckPagesDraft = 'puckPagesDraft' in result
    ? (result.puckPagesDraft as Record<string, unknown> | null)
    : null;
  const puckPages = 'puckPages' in result
    ? (result.puckPages as Record<string, unknown> | null)
    : null;
  const puckPageMeta = 'puckPageMeta' in result
    ? (result.puckPageMeta as Record<string, { title: string }> | null)
    : null;

  const data = (puckPagesDraft?.[pagePath] ?? puckPages?.[pagePath] ?? emptyPageData) as Data;
  const pageTitle = pagePath === '/' ? 'Home' : (puckPageMeta?.[pagePath]?.title ?? pagePath);

  const pageLinks: Array<{ href: string; label: string }> = [];
  if (puckPagesDraft?.['/'] || puckPages?.['/']) {
    pageLinks.push({ href: '/', label: 'Home' });
  }
  for (const [metaPath, meta] of Object.entries(puckPageMeta ?? {})) {
    if (metaPath === '/') continue;
    pageLinks.push({ href: metaPath, label: (meta as { title: string }).title });
  }

  const backHref = `/p/${slug}/admin/site-builder/pages`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href={backHref} className="text-gray-500 hover:text-gray-700">
            ← Pages
          </Link>
          <span className="text-gray-400">/</span>
          <span className="font-medium text-gray-900">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{pagePath}</span>
          <a
            href={`${pagePath}${pagePath === '/' ? '' : '/'}?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Preview Page ↗
          </a>
        </div>
      </div>
      <PuckPageEditor initialData={data} pagePath={pagePath} pageLinks={pageLinks} />
    </div>
  );
}
