import type { LandingPageConfig } from './landing-types';

export function createDefaultLandingPage(
  siteName: string,
  tagline: string,
  locationName: string,
  enabled: boolean
): LandingPageConfig {
  const locationText = locationName ? ` at ${locationName}` : '';
  return {
    enabled,
    blocks: [
      {
        id: crypto.randomUUID(),
        type: 'hero' as const,
        title: siteName,
        subtitle: tagline,
      },
      {
        id: crypto.randomUUID(),
        type: 'text' as const,
        content: `Welcome to ${siteName}${locationText}. Explore our interactive map to discover and track points of interest in the field.`,
      },
      {
        id: crypto.randomUUID(),
        type: 'stats' as const,
        source: 'auto' as const,
      },
      {
        id: crypto.randomUUID(),
        type: 'button' as const,
        label: 'Explore the Map',
        href: '/map',
        style: 'primary' as const,
        size: 'large' as const,
      },
    ],
    assets: [],
  };
}
