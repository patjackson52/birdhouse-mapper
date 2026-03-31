import { Render } from '@puckeditor/core';
import { pageConfig } from '@/lib/puck/config';
import type { Data } from '@puckeditor/core';

interface PuckPageRendererProps {
  data: Data;
}

export function PuckPageRenderer({ data }: PuckPageRendererProps) {
  return <Render config={pageConfig} data={data} />;
}
