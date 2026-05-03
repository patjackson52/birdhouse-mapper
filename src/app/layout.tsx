import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { PuckRootRenderer } from '@/components/puck/PuckRootRenderer';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';
import { resolveTheme, themeToCssVars } from '@/lib/config/themes';
import { UserLocationProvider } from '@/lib/location/provider';
import QueryProvider from '@/components/QueryProvider';
import { OfflineProvider } from '@/lib/offline/provider';
import { createClient } from '@/lib/supabase/server';
import type { Data } from '@puckeditor/core';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpeedInsights } from '@vercel/speed-insights/next';

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
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const headersList = await headers();
  const isPlatform = headersList.get('x-tenant-source') === 'platform';

  if (isPlatform) {
    return (
      <html lang="en">
        <body className="antialiased">
          {children}
          {modal}
          <SpeedInsights />
        </body>
      </html>
    );
  }

  const config = await getConfig();
  const theme = resolveTheme(config.theme, config.mapStyle);
  const cssVars = themeToCssVars(theme);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isPreview = headersList.get('x-preview') === 'true';
  const puckRoot = (isPreview
    ? (config.puckRootDraft ?? config.puckRoot)
    : config.puckRoot) as Data | null;
  const isAdminRoute = headersList.get('x-is-admin-route') === 'true';

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
        <link rel="manifest" href="/api/manifest.json" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="icon" type="image/png" sizes="32x32" href="/defaults/logos/favicon-32.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config} theme={theme}>
          <UserLocationProvider>
            <OfflineProvider>
              <QueryProvider>
                {puckRoot && !isAdminRoute ? (
                  <PuckRootRenderer data={puckRoot}>
                    <main className="flex-1">{children}</main>
                  </PuckRootRenderer>
                ) : (
                  <>
                    <Navigation isAuthenticated={!!user} />
                    <main className="flex-1">{children}</main>
                  </>
                )}
                {modal}
              </QueryProvider>
            </OfflineProvider>
          </UserLocationProvider>
        </ConfigProvider>
        <SpeedInsights />
        <script
          dangerouslySetInnerHTML={{
            __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    `,
          }}
        />
      </body>
    </html>
  );
}
