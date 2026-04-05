import { createServiceClient } from '@/lib/supabase/server';
import { resolveFeatures, type FeatureMap } from './features';
import type { SubscriptionTier } from '@/lib/types';

/**
 * Fetches an org's subscription tier and feature overrides,
 * then resolves the full feature map.
 *
 * Uses service-role client so this works in any context
 * (platform admin pages AND org-context pages for enforcement).
 */
export async function resolveOrgFeatures(orgId: string): Promise<FeatureMap> {
  const supabase = createServiceClient();

  const [orgResult, overridesResult] = await Promise.all([
    supabase.from('orgs').select('subscription_tier').eq('id', orgId).single(),
    supabase.from('org_feature_overrides').select('feature, value').eq('org_id', orgId),
  ]);

  const tier = (orgResult.data?.subscription_tier as SubscriptionTier) ?? 'free';
  const overrides = overridesResult.data ?? [];

  return resolveFeatures(tier, overrides);
}
