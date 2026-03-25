import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';
import { resolveTheme, themeToCssVars } from '@/lib/config/themes';
import { UserLocationProvider } from '@/lib/location/provider';
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

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config} theme={theme}>
          <UserLocationProvider>
            <Navigation />
            <main className="flex-1">{children}</main>
          </UserLocationProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
