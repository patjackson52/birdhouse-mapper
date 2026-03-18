import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';

// Metadata will be made dynamic in Phase 3 (theming).
// For now, use a simple default that doesn't reference IslandWood.
export const metadata = {
  title: 'Field Mapper',
  description: 'Map and track points of interest',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getConfig();

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <ConfigProvider config={config}>
          <Navigation />
          <main className="flex-1">{children}</main>
        </ConfigProvider>
      </body>
    </html>
  );
}
