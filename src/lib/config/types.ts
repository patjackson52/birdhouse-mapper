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

/**
 * Build a SiteConfig from org + property structured columns.
 * This replaces the old CONFIG_KEY_MAP approach that read from site_config.
 */
export function buildSiteConfig(
  org: {
    name: string;
    tagline: string | null;
    logo_url: string | null;
    favicon_url: string | null;
    theme: { preset: string; overrides?: Record<string, string> } | null;
    setup_complete: boolean;
  },
  property: {
    description: string | null;
    map_default_lat: number | null;
    map_default_lng: number | null;
    map_default_zoom: number | null;
    map_style: string | null;
    custom_map: unknown | null;
    about_content: string | null;
    footer_text: string | null;
    footer_links: unknown | null;
    custom_nav_items: unknown | null;
    landing_page: unknown | null;
    logo_url: string | null;
  }
): SiteConfig {
  return {
    siteName: org.name,
    tagline: org.tagline ?? '',
    locationName: property.description ?? '',
    mapCenter: {
      lat: property.map_default_lat ?? 0,
      lng: property.map_default_lng ?? 0,
      zoom: property.map_default_zoom ?? 2,
    },
    theme: org.theme ?? { preset: 'forest' },
    aboutContent: property.about_content ?? '',
    logoUrl: property.logo_url ?? org.logo_url,
    faviconUrl: org.favicon_url,
    footerText: property.footer_text ?? '',
    footerLinks: (property.footer_links as { label: string; url: string }[]) ?? [],
    customMap: property.custom_map as SiteConfig['customMap'],
    mapStyle: property.map_style,
    customNavItems: (property.custom_nav_items as { label: string; href: string }[]) ?? [],
    setupComplete: org.setup_complete,
    landingPage: property.landing_page as LandingPageConfig | null,
  };
}
