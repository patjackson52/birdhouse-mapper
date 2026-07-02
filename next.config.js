const withSerwist = require('@serwist/next').default({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Next 14 uses experimental.serverComponentsExternalPackages. The Next 15
    // top-level `serverExternalPackages` key is unrecognized here (logged a
    // warning on every build/start), so `sharp` belongs in this array.
    serverComponentsExternalPackages: ['isomorphic-dompurify', 'sharp'],
  },
};

module.exports = withSerwist(nextConfig);
