import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { PuckRootRenderer } from '@/components/puck/PuckRootRenderer';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';
import { resolveTheme, themeToCssVars } from '@/lib/config/themes';
import { UserLocationProvider } from '@/lib/location/provider';
import { createClient } from '@/lib/supabase/server';
import type { Data } from '@puckeditor/core';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  if (headersList.get('x-tenant-source') === 'platform') {
    return {
      title: 'FieldMapper — Field mapping for conservation teams',
      description: 'Track nest boxes, wildlife stations, and field assets. Interactive maps, team collaboration, and public dashboards.',
    };
  }
  const config = await getConfig();
  return {
    title: config.siteName,
    description: config.tagline,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const isPlatform = headersList.get('x-tenant-source') === 'platform';

  if (isPlatform) {
    return (
      <html lang="en">
        <body className="antialiased">{children}</body>
      </html>
    );
  }

  const config = await getConfig();
  const theme = resolveTheme(config.theme, config.mapStyle);
  const cssVars = themeToCssVars(theme);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const puckRoot = config.puckRoot as Data | null;

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config} theme={theme}>
          <UserLocationProvider>
            {puckRoot ? (
              <PuckRootRenderer data={puckRoot}>
                <main className="flex-1">{children}</main>
              </PuckRootRenderer>
            ) : (
              <>
                <Navigation isAuthenticated={!!user} />
                <main className="flex-1">{children}</main>
              </>
            )}
          </UserLocationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
