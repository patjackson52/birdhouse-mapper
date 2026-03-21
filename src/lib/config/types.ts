import type { LandingPageConfig } from './landing-types';

export interface SiteConfig {
  siteName: string;
  tagline: string;
  locationName: string;
  mapCenter: { lat: number; lng: number; zoom: number };
  theme: { preset: string; overrides?: Record<string, string> };
  aboutContent: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string;
  footerLinks: { label: string; url: string }[];
  customMap: {
    url: string;
    bounds: {
      southWest: { lat: number; lng: number };
      northEast: { lat: number; lng: number };
    };
    rotation: number;
    corners?: {
      topLeft: { lat: number; lng: number };
      topRight: { lat: number; lng: number };
      bottomLeft: { lat: number; lng: number };
    };
    opacity: number;
  } | null;
  mapStyle: string | null; // map tile source ID, null = use theme default
  customNavItems: { label: string; href: string }[];
  setupComplete: boolean;
  landingPage: LandingPageConfig | null;
}

/** Maps site_config DB keys to SiteConfig property names */
export const CONFIG_KEY_MAP: Record<string, keyof SiteConfig> = {
  site_name: 'siteName',
  tagline: 'tagline',
  location_name: 'locationName',
  map_center: 'mapCenter',
  theme: 'theme',
  about_content: 'aboutContent',
  logo_url: 'logoUrl',
  favicon_url: 'faviconUrl',
  footer_text: 'footerText',
  footer_links: 'footerLinks',
  custom_map: 'customMap',
  map_style: 'mapStyle',
  custom_nav_items: 'customNavItems',
  setup_complete: 'setupComplete',
  landing_page: 'landingPage',
};
