import { getPuckData } from '@/app/admin/site-builder/actions';
import { PagesListClient } from './PagesListClient';
import type { PageMeta } from '@/lib/puck/page-utils';

export default async function PagesListPage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const puckPages = ('puckPages' in result ? result.puckPages : null) as Record<string, unknown> | null;
  const puckPagesDraft = ('puckPagesDraft' in result ? result.puckPagesDraft : null) as Record<string, unknown> | null;
  const puckPageMeta = ('puckPageMeta' in result ? result.puckPageMeta : null) as Record<string, PageMeta> | null;

  return (
    <PagesListClient
      puckPages={puckPages}
      puckPagesDraft={puckPagesDraft}
      puckPageMeta={puckPageMeta}
    />
  );
}
