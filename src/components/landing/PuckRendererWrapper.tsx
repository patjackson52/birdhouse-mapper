'use client';

import { Render } from '@measured/puck';
import type { Data, Config } from '@measured/puck';

interface PuckRendererWrapperProps {
  data: Data;
  config: Config;
}

export default function PuckRendererWrapper({ data, config }: PuckRendererWrapperProps) {
  return <Render config={config} data={data} />;
}
