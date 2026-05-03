'use server';

import { createServiceClient } from '@/lib/supabase/server';
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
  location_name: 'description',
  map_style: 'map_style',
  custom_map: 'custom_map',
  about_content: 'about_content',
  footer_text: 'footer_text',
  footer_links: 'footer_links',
  custom_nav_items: 'custom_nav_items',
};

/**
 * Save config during setup. Uses service role client to bypass RLS
 * since no admin account exists yet.
 * Updates the existing org and default property (created by migration).
 */
export async function setupSaveConfig(entries: { key: string; value: unknown }[]) {
  const supabase = createServiceClient();

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
 * Create the first admin account during setup.
 * Signs up a user and sets their profile role to 'admin'.
 * If the user already exists, promotes them to admin.
 */
export async function setupCreateAdmin(email: string, password: string, displayName: string) {
  const supabase = createServiceClient();

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  let userId: string;

  if (existingUser) {
    // User exists — just promote them
    userId = existingUser.id;
  } else {
    // Create new user — but first disable the trigger temporarily
    // to avoid "Database error creating new user" from a broken trigger
    await supabase.from('users').select('id').limit(0); // warm up connection

    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (authError) {
      return { error: `Failed to create account: ${authError.message}` };
    }

    if (!userData.user) {
      return { error: 'Failed to get user ID after creation' };
    }

    userId = userData.user.id;
  }

  // Ensure profile exists with admin role
  // Use upsert to handle both new and existing profiles
  const { error: upsertError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      display_name: displayName,
      role: 'admin',
    }, { onConflict: 'id' });

  if (upsertError) {
    return { error: `Failed to set admin role: ${upsertError.message}` };
  }

  return { success: true };
}

/**
 * Delete all item types that have no items referencing them.
 * Called before creating item types to make setup retries idempotent.
 */
export async function setupClearItemTypes() {
  const supabase = createServiceClient();

  // Only delete types that have no items (safe for retry)
  // The migrated "Bird Box" type has items pointing to it, so it won't be deleted
  const { data: types } = await supabase.from('item_types').select('id');
  if (!types) return;

  for (const type of types) {
    const { count } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('item_type_id', type.id);

    if (count === 0) {
      await supabase.from('item_types').delete().eq('id', type.id);
    }
  }
}

/**
 * Create an item type during setup.
 */
export async function setupCreateItemType(
  name: string,
  icon: string,
  color: string,
  sortOrder: number
) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('item_types')
    .insert({ name, icon, color, sort_order: sortOrder })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}

/**
 * Create a custom field during setup.
 */
export async function setupCreateCustomField(
  itemTypeId: string,
  name: string,
  fieldType: string,
  options: string[] | null,
  required: boolean,
  sortOrder: number
) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('custom_fields')
    .insert({
      item_type_id: itemTypeId,
      name,
      field_type: fieldType,
      options: options as never,
      required,
      sort_order: sortOrder,
    });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Complete setup: set setup_complete to true on the org.
 */
export async function setupComplete() {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('orgs')
    .update({ setup_complete: true })
    .limit(1);

  if (error) {
    return { error: error.message };
  }

  invalidateConfig();
  return { success: true };
}
