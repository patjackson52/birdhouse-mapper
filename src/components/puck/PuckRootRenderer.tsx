import { Render } from '@puckeditor/core';
import { chromeConfig } from '@/lib/puck/chrome-config';
import type { Data } from '@puckeditor/core';

interface PuckRootRendererProps {
  data: Data | null;
  children: React.ReactNode;
}

const headerTypes = new Set(['HeaderBar', 'NavBar', 'AnnouncementBar']);

export function PuckRootRenderer({ data, children }: PuckRootRendererProps) {
  if (!data) return <>{children}</>;

  const headerComponents = data.content.filter((c) => headerTypes.has(c.type));
  const footerComponents = data.content.filter((c) => !headerTypes.has(c.type));

  const headerData: Data = { ...data, content: headerComponents };
  const footerData: Data = { ...data, content: footerComponents };

  return (
    <>
      {headerComponents.length > 0 && <Render config={chromeConfig} data={headerData} />}
      {children}
      {footerComponents.length > 0 && <Render config={chromeConfig} data={footerData} />}
    </>
  );
}
