'use server';

import { createClient } from '@/lib/supabase/server';
import { PLATFORM_FEATURES, type FeatureKey } from '@/lib/platform/features';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

async function requirePlatformAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, userId: null };

  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) return { error: 'Unauthorized' as const, supabase: null, userId: null };

  return { error: null, supabase, userId: user.id };
}

export async function updateOrg(
  orgId: string,
  updates: {
    name?: string;
    slug?: string;
    subscription_tier?: SubscriptionTier;
    subscription_status?: SubscriptionStatus;
  },
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.subscription_tier !== undefined) payload.subscription_tier = updates.subscription_tier;
  if (updates.subscription_status !== undefined) payload.subscription_status = updates.subscription_status;

  if (Object.keys(payload).length === 0) return { success: true };

  const { error } = await supabase!.from('orgs').update(payload).eq('id', orgId);
  if (error) return { error: error.message };

  return { success: true };
}

export async function setFeatureOverride(
  orgId: string,
  feature: string,
  value: unknown,
  note?: string,
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase, userId } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];
  if (!featureKeys.includes(feature as FeatureKey)) {
    return { error: `Unknown feature: ${feature}` };
  }

  const { error } = await supabase!.from('org_feature_overrides').upsert(
    {
      org_id: orgId,
      feature,
      value: value as any,
      note: note ?? null,
      set_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,feature' },
  );

  if (error) return { error: error.message };
  return { success: true };
}

export async function removeFeatureOverride(
  orgId: string,
  feature: string,
): Promise<{ success?: boolean; error?: string }> {
  const { error: authError, supabase } = await requirePlatformAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase!
    .from('org_feature_overrides')
    .delete()
    .eq('org_id', orgId)
    .eq('feature', feature);

  if (error) return { error: error.message };
  return { success: true };
}
