import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, CacheFirst, ExpirationPlugin, NetworkFirst, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Override defaultCache's CacheFirst for /_next/static JS with
    // StaleWhileRevalidate so deployments aren't blocked by stale chunks.
    {
      matcher: /\/_next\/static.+\.js$/i,
      handler: new StaleWhileRevalidate({
        cacheName: 'next-static-js-assets',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) => {
        return (
          url.hostname.includes('tile.openstreetmap.org') ||
          url.hostname.includes('basemaps.cartocdn.com') ||
          url.hostname.includes('tiles.stadiamaps.com') ||
          url.hostname.includes('server.arcgisonline.com') ||
          url.hostname.includes('stamen-tiles.a.ssl.fastly.net')
        );
      },
      handler: new CacheFirst({
        cacheName: 'map-tiles',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30000,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) => {
        return url.hostname.includes('supabase.co') && url.pathname.includes('/storage/');
      },
      handler: new NetworkFirst({
        cacheName: 'supabase-storage',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 60 * 60 * 24 * 7,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
