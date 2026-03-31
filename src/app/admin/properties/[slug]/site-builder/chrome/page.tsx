import { getPuckData } from '@/app/admin/site-builder/actions';
import { PuckChromeEditor } from '@/components/puck/PuckChromeEditor';
import type { Data } from '@puckeditor/core';

const emptyChromeData: Data = {
  root: { props: {} },
  content: [],
};

export default async function SiteBuilderChromePage() {
  const result = await getPuckData();

  if ('error' in result && result.error) {
    return <div className="rounded-lg bg-red-50 p-4 text-red-600">{result.error}</div>;
  }

  // Use draft if available, otherwise published, otherwise empty
  const data = ('puckRootDraft' in result
    ? (result.puckRootDraft ?? result.puckRoot ?? emptyChromeData)
    : emptyChromeData) as Data;

  return <PuckChromeEditor initialData={data} />;
}
