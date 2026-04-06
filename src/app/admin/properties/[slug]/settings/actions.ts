'use server';

import { createClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';

/** Keys that map to columns on the orgs table */
const ORG_KEY_TO_COLUMN: Record<string, string> = {
  site_name: 'name',
  tagline: 'tagline',
  logo_url: 'logo_url',
  favicon_url: 'favicon_url',
  theme: 'theme',
};

/** Keys that map to columns on the properties table */
const PROPERTY_KEY_TO_COLUMN: Record<string, string> = {
  pwa_name: 'pwa_name',
  location_name: 'description',
  map_style: 'map_style',
  custom_map: 'custom_map',
  about_content: 'about_content',
  about_page_enabled: 'about_page_enabled',
  footer_text: 'footer_text',
  footer_links: 'footer_links',
  custom_nav_items: 'custom_nav_items',
  map_display_config: 'map_display_config',
};

/**
 * Save one or more site config key-value pairs.
 * Routes each entry to the orgs or properties table.
 * Requires admin role (enforced by RLS).
 */
export async function saveConfig(entries: { key: string; value: unknown }[]) {
  const supabase = createClient();

  // Get the single org and default property
  const { data: org, error: orgLookupError } = await supabase
    .from('orgs')
    .select('id, default_property_id')
    .limit(1)
    .single();

  if (orgLookupError || !org) {
    return { error: `Failed to find org: ${orgLookupError?.message ?? 'not found'}` };
  }

  const orgId = org.id;
  const propertyId = org.default_property_id;

  // Collect updates for each table
  const orgUpdates: Record<string, unknown> = {};
  const propertyUpdates: Record<string, unknown> = {};

  for (const entry of entries) {
    if (entry.value === null || entry.value === undefined) continue;

    // Handle map_center specially: it splits into separate property columns
    if (entry.key === 'map_center') {
      const center = entry.value as { lat: number; lng: number; zoom: number };
      propertyUpdates['map_default_lat'] = center.lat;
      propertyUpdates['map_default_lng'] = center.lng;
      propertyUpdates['map_default_zoom'] = center.zoom;
      continue;
    }

    const orgCol = ORG_KEY_TO_COLUMN[entry.key];
    if (orgCol) {
      orgUpdates[orgCol] = entry.value;
      continue;
    }

    const propCol = PROPERTY_KEY_TO_COLUMN[entry.key];
    if (propCol) {
      propertyUpdates[propCol] = entry.value;
      continue;
    }
  }

  // Write org updates
  if (Object.keys(orgUpdates).length > 0) {
    const { error } = await supabase
      .from('orgs')
      .update(orgUpdates)
      .eq('id', orgId);

    if (error) {
      return { error: `Failed to save org settings: ${error.message}` };
    }
  }

  // Write property updates
  if (Object.keys(propertyUpdates).length > 0 && propertyId) {
    const { error } = await supabase
      .from('properties')
      .update(propertyUpdates)
      .eq('id', propertyId);

    if (error) {
      return { error: `Failed to save property settings: ${error.message}` };
    }
  }

  invalidateConfig();
  return { success: true };
}

/**
 * Save a single config value by key.
 */
export async function saveConfigValue(key: string, value: unknown) {
  return saveConfig([{ key, value }]);
}
