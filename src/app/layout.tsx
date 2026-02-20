import type { Metadata } from 'next';
import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';

export const metadata: Metadata = {
  title: 'IslandWood Birdhouses — Eagle Scout Project',
  description:
    'Tracking birdhouses built and installed at IslandWood camp on Bainbridge Island, Washington. An Eagle Scout service project.',
  keywords: [
    'birdhouse',
    'IslandWood',
    'Bainbridge Island',
    'Eagle Scout',
    'bird conservation',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navigation />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
