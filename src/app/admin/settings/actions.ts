'use server';

import { createClient } from '@/lib/supabase/server';
import { invalidateConfig } from '@/lib/config/server';

/**
 * Save one or more site config key-value pairs.
 * Requires admin role (enforced by RLS).
 */
export async function saveConfig(entries: { key: string; value: unknown }[]) {
  const supabase = createClient();

  for (const entry of entries) {
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
 * Save a single config value by key.
 */
export async function saveConfigValue(key: string, value: unknown) {
  return saveConfig([{ key, value }]);
}
