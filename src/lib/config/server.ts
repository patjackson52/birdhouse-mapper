import { unstable_cache, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_CONFIG } from './defaults';
import { buildSiteConfig, type SiteConfig } from './types';
import { createDefaultLandingPage } from './landing-defaults';

const CACHE_TAG = 'site-config';

/**
 * Creates a Supabase client with service role for config reads.
 * Uses service role because orgs/properties have RLS requiring authentication,
 * but config needs to be readable for public pages (landing, about, map).
 */
function createConfigClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetches site config by reading from orgs + properties.
 * Cached for 60 seconds, busted immediately via revalidateTag on admin save.
 */
export const getConfig = unstable_cache(
  async (): Promise<SiteConfig> => {
    const supabase = createConfigClient();

    // Get the first org and its default property
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .select('name, tagline, logo_url, favicon_url, theme, setup_complete, default_property_id')
      .limit(1)
      .single();

    if (orgError || !org) {
      console.error('Failed to fetch org config:', orgError?.message);
      return { ...DEFAULT_CONFIG };
    }

    const propertyId = org.default_property_id;
    if (!propertyId) {
      console.error('No default property configured');
      return { ...DEFAULT_CONFIG };
    }

    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id, name, description, map_default_lat, map_default_lng, map_default_zoom, map_style, custom_map, about_content, about_page_enabled, footer_text, footer_links, custom_nav_items, landing_page, logo_url, puck_pages, puck_root, puck_template, puck_pages_draft, puck_root_draft')
      .eq('id', propertyId)
      .single();

    if (propError || !property) {
      console.error('Failed to fetch property config:', propError?.message);
      return { ...DEFAULT_CONFIG };
    }

    const config = buildSiteConfig(org, property);

    // Backfill landing page for existing sites
    if (config.landingPage === null && config.setupComplete) {
      config.landingPage = createDefaultLandingPage(
        config.siteName,
        config.tagline,
        config.locationName,
        false
      );
    }

    return config;
  },
  [CACHE_TAG],
  { revalidate: 60, tags: [CACHE_TAG] }
);

/**
 * Call this after saving config in admin to immediately bust the cache.
 */
export function invalidateConfig() {
  revalidateTag(CACHE_TAG);
}
