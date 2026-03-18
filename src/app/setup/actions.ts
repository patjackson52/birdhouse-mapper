'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';

/**
 * Save config during setup. Uses service role client to bypass RLS
 * since no admin account exists yet.
 */
export async function setupSaveConfig(entries: { key: string; value: unknown }[]) {
  const supabase = createServiceClient();

  for (const entry of entries) {
    // Supabase sends JS null as SQL NULL, but site_config.value is NOT NULL jsonb.
    // JSONB null (the literal) is a valid non-null value, so we need to handle this:
    // when value is JS null, we skip the update (the DB already has jsonb null from seed).
    if (entry.value === null || entry.value === undefined) continue;

    const { error } = await supabase
      .from('site_config')
      .update({ value: entry.value as never })
      .eq('key', entry.key);

    if (error) {
      return { error: `Failed to save ${entry.key}: ${error.message}` };
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

  // Try to create the user via admin API
  const { data: userData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (authError) {
    // If user creation failed, check if the user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === email
    );

    if (existingUser) {
      // User exists — ensure they have an admin profile
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: existingUser.id,
          display_name: displayName,
          role: 'admin',
        }, { onConflict: 'id' });

      if (upsertError) {
        return { error: `Failed to set admin role: ${upsertError.message}` };
      }
      return { success: true };
    }

    return { error: `Failed to create account: ${authError.message}` };
  }

  // User created successfully — ensure profile exists with admin role
  // (The trigger may or may not have fired successfully)
  if (userData.user) {
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: userData.user.id,
        display_name: displayName,
        role: 'admin',
      }, { onConflict: 'id' });

    if (upsertError) {
      return { error: `Account created but failed to set admin role: ${upsertError.message}` };
    }
  }

  return { success: true };
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
 * Complete setup: set setup_complete to true and clear the setup_done cookie.
 */
export async function setupComplete() {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('site_config')
    .update({ value: true as never })
    .eq('key', 'setup_complete');

  if (error) {
    return { error: error.message };
  }

  invalidateConfig();
  return { success: true };
}
