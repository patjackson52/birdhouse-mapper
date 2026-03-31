import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckPageEditor } from '@/components/puck/PuckPageEditor';
import type { Data } from '@puckeditor/core';

const emptyPageData: Data = {
  root: { props: {} },
  content: [],
};

export default async function SiteBuilderLandingPage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  const data = ('puckPagesDraft' in result
    ? (result.puckPagesDraft?.['/'] ?? result.puckPages?.['/'] ?? emptyPageData)
    : emptyPageData) as Data;

  return <PuckPageEditor initialData={data} pagePath="/" />;
}
