import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';
import { resolveTheme, themeToCssVars } from '@/lib/config/themes';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
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
  const config = await getConfig();
  const theme = resolveTheme(config.theme);
  const cssVars = themeToCssVars(theme);

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config} theme={theme}>
          <Navigation />
          <main className="flex-1">{children}</main>
        </ConfigProvider>
      </body>
    </html>
  );
}
