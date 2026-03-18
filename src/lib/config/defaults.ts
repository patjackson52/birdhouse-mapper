import type { SiteConfig } from './types';

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'Field Mapper',
  tagline: 'Map and track points of interest',
  locationName: '',
  mapCenter: { lat: 0, lng: 0, zoom: 2 },
  theme: { preset: 'forest' },
  aboutContent: '# About\n\nDescribe your project here.',
  logoUrl: null,
  faviconUrl: null,
  footerText: 'Built with Field Mapper',
  footerLinks: [],
  customMap: null,
  customNavItems: [],
  setupComplete: false,
};
