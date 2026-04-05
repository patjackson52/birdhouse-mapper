import type { LandingPageConfig } from './landing-types';

export interface SiteConfig {
  siteName: string;
  propertyName: string | null;
  pwaName: string | null;
  tagline: string;
  locationName: string;
  propertyId: string | null;
  mapCenter: { lat: number; lng: number; zoom: number };
  theme: { preset: string; overrides?: Record<string, string> };
  aboutContent: string;
  aboutPageEnabled: boolean;
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
  platformDomain: string | null;
  // Puck site builder (null = legacy mode)
  puckPages: Record<string, unknown> | null;
  puckRoot: Record<string, unknown> | null;
  puckTemplate: string | null;
  puckPagesDraft: Record<string, unknown> | null;
  puckRootDraft: Record<string, unknown> | null;
}

/**
 * Build a SiteConfig from org + property structured columns.
 * This replaces the old CONFIG_KEY_MAP approach that read from site_config.
 */
export function buildSiteConfig(
  org: {
    name: string;
    pwa_name?: string | null;
    tagline: string | null;
    logo_url: string | null;
    favicon_url: string | null;
    theme: { preset: string; overrides?: Record<string, string> } | null;
    setup_complete: boolean;
  },
  property: {
    id?: string;
    name?: string;
    pwa_name?: string | null;
    description: string | null;
    map_default_lat: number | null;
    map_default_lng: number | null;
    map_default_zoom: number | null;
    map_style: string | null;
    custom_map: unknown | null;
    about_content: string | null;
    about_page_enabled: boolean | null;
    footer_text: string | null;
    footer_links: unknown | null;
    custom_nav_items: unknown | null;
    landing_page: unknown | null;
    logo_url: string | null;
    puck_pages: unknown | null;
    puck_root: unknown | null;
    puck_template: string | null;
    puck_pages_draft: unknown | null;
    puck_root_draft: unknown | null;
  }
): SiteConfig {
  return {
    siteName: property.name ?? org.name,
    propertyName: property.name ?? null,
    pwaName: property.pwa_name ?? org.pwa_name ?? null,
    tagline: org.tagline ?? '',
    locationName: property.description ?? '',
    propertyId: property.id ?? null,
    mapCenter: {
      lat: property.map_default_lat ?? 0,
      lng: property.map_default_lng ?? 0,
      zoom: property.map_default_zoom ?? 2,
    },
    theme: org.theme ?? { preset: 'forest' },
    aboutContent: property.about_content ?? '',
    aboutPageEnabled: property.about_page_enabled ?? true,
    logoUrl: property.logo_url ?? org.logo_url,
    faviconUrl: org.favicon_url,
    footerText: property.footer_text ?? '',
    footerLinks: (property.footer_links as { label: string; url: string }[]) ?? [],
    customMap: property.custom_map as SiteConfig['customMap'],
    mapStyle: property.map_style,
    customNavItems: (property.custom_nav_items as { label: string; href: string }[]) ?? [],
    setupComplete: org.setup_complete,
    landingPage: property.landing_page as LandingPageConfig | null,
    platformDomain: process.env.PLATFORM_DOMAIN ?? null,
    puckPages: property.puck_pages as Record<string, unknown> | null ?? null,
    puckRoot: property.puck_root as Record<string, unknown> | null ?? null,
    puckTemplate: property.puck_template ?? null,
    puckPagesDraft: property.puck_pages_draft as Record<string, unknown> | null ?? null,
    puckRootDraft: property.puck_root_draft as Record<string, unknown> | null ?? null,
  };
}
