'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { invalidateConfig } from '@/lib/config/server';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  pwa_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  theme: unknown | null;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  map_display_config: unknown | null;
  allow_public_contributions: boolean;
  moderation_mode: 'auto_approve' | 'manual_review';
}

export async function getOrgSettings(): Promise<{ data?: OrgSettings; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data, error } = await supabase
    .from('orgs')
    .select('id, name, slug, tagline, pwa_name, logo_url, favicon_url, theme, subscription_tier, subscription_status, map_display_config, allow_public_contributions, moderation_mode')
    .eq('id', tenant.orgId)
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Org not found' };
  }

  return {
    data: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      tagline: data.tagline,
      pwa_name: data.pwa_name,
      logo_url: data.logo_url,
      favicon_url: data.favicon_url,
      theme: data.theme,
      subscription_tier: data.subscription_tier as SubscriptionTier,
      subscription_status: data.subscription_status as SubscriptionStatus,
      map_display_config: data.map_display_config,
      allow_public_contributions: data.allow_public_contributions,
      moderation_mode: data.moderation_mode as 'auto_approve' | 'manual_review',
    },
  };
}

export interface OrgSettingsUpdates {
  name?: string;
  slug?: string;
  tagline?: string;
  pwa_name?: string;
  logo_url?: string;
  theme?: unknown;
  map_display_config?: unknown;
  allow_public_contributions?: boolean;
  moderation_mode?: 'auto_approve' | 'manual_review';
}

export async function updateOrgSettings(
  updates: OrgSettingsUpdates,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Validate slug format if provided
  if (updates.slug !== undefined) {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(updates.slug)) {
      return {
        error:
          'Slug must be lowercase letters, numbers, and hyphens only (e.g. my-org)',
      };
    }
  }

  // Build the update payload — only include defined values
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.tagline !== undefined) payload.tagline = updates.tagline;
  if (updates.pwa_name !== undefined) payload.pwa_name = updates.pwa_name;
  if (updates.logo_url !== undefined) payload.logo_url = updates.logo_url;
  if (updates.theme !== undefined) payload.theme = updates.theme;
  if (updates.map_display_config !== undefined) payload.map_display_config = updates.map_display_config;
  if (updates.allow_public_contributions !== undefined) payload.allow_public_contributions = updates.allow_public_contributions;
  if (updates.moderation_mode !== undefined) payload.moderation_mode = updates.moderation_mode;

  if (Object.keys(payload).length === 0) {
    return { success: true }; // nothing to update
  }

  const { error } = await supabase
    .from('orgs')
    .update(payload)
    .eq('id', tenant.orgId);

  if (error) {
    if (error.code === '23505') {
      return { error: 'That slug is already taken. Please choose a different one.' };
    }
    return { error: error.message };
  }

  invalidateConfig();
  return { success: true };
}
