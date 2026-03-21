import { unstable_cache, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_CONFIG } from './defaults';
import { CONFIG_KEY_MAP, type SiteConfig } from './types';
import { createDefaultLandingPage } from './landing-defaults';

const CACHE_TAG = 'site-config';

/**
 * Creates a lightweight Supabase client for config reads.
 * Uses anon key only — no cookies needed since site_config has public SELECT.
 * This avoids issues with unstable_cache running outside request context.
 */
function createConfigClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetches all site config from the database.
 * Cached for 60 seconds, busted immediately via revalidateTag on admin save.
 */
export const getConfig = unstable_cache(
  async (): Promise<SiteConfig> => {
    const supabase = createConfigClient();
    const { data, error } = await supabase
      .from('site_config')
      .select('key, value');

    if (error || !data) {
      console.error('Failed to fetch site config:', error?.message);
      return { ...DEFAULT_CONFIG };
    }

    const config = { ...DEFAULT_CONFIG };

    for (const row of data) {
      const propName = CONFIG_KEY_MAP[row.key];
      if (propName) {
        (config as Record<string, unknown>)[propName] = row.value;
      }
    }

    // Backfill landing page for existing sites that were set up before this feature
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
