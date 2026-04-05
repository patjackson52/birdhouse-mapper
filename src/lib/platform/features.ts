import type { SubscriptionTier } from '@/lib/types';

// --- Feature Registry ---

export const PLATFORM_FEATURES = {
  // Boolean features
  tasks:          { type: 'boolean' as const, label: 'Tasks Module' },
  volunteers:     { type: 'boolean' as const, label: 'Volunteers Module' },
  public_forms:   { type: 'boolean' as const, label: 'Public Forms' },
  qr_codes:       { type: 'boolean' as const, label: 'QR Codes' },
  reports:        { type: 'boolean' as const, label: 'Reports' },
  ai_context:     { type: 'boolean' as const, label: 'AI Context' },
  custom_domains: { type: 'boolean' as const, label: 'Custom Domains' },
  site_builder:   { type: 'boolean' as const, label: 'Site Builder' },
  knowledge:      { type: 'boolean' as const, label: 'Knowledge Base' },
  // Numeric limits (null = unlimited)
  max_properties:         { type: 'numeric' as const, label: 'Max Properties' },
  max_members:            { type: 'numeric' as const, label: 'Max Members' },
  storage_limit_mb:       { type: 'numeric' as const, label: 'Storage Limit (MB)' },
  max_ai_context_entries: { type: 'numeric' as const, label: 'Max AI Context Entries' },
} as const;

export type FeatureKey = keyof typeof PLATFORM_FEATURES;

export type FeatureMap = {
  [K in FeatureKey]: typeof PLATFORM_FEATURES[K]['type'] extends 'boolean'
    ? boolean
    : number | null;
};

// --- Tier Defaults ---

export const TIER_DEFAULTS: Record<SubscriptionTier, FeatureMap> = {
  free: {
    tasks: false, volunteers: false, public_forms: true, qr_codes: false,
    reports: false, ai_context: false, custom_domains: false, site_builder: false, knowledge: false,
    max_properties: 1, max_members: 5, storage_limit_mb: 100, max_ai_context_entries: 0,
  },
  community: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: false, ai_context: false, custom_domains: false, site_builder: false, knowledge: false,
    max_properties: 3, max_members: 25, storage_limit_mb: 500, max_ai_context_entries: 10,
  },
  pro: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: true, ai_context: true, custom_domains: true, site_builder: true, knowledge: true,
    max_properties: null, max_members: null, storage_limit_mb: 5000, max_ai_context_entries: 100,
  },
  municipal: {
    tasks: true, volunteers: true, public_forms: true, qr_codes: true,
    reports: true, ai_context: true, custom_domains: true, site_builder: true, knowledge: true,
    max_properties: null, max_members: null, storage_limit_mb: null, max_ai_context_entries: null,
  },
};

// --- Feature Resolution ---

export type FeatureOverride = { feature: string; value: unknown };

export function resolveFeatures(
  tier: SubscriptionTier,
  overrides: FeatureOverride[],
): FeatureMap {
  const defaults = { ...TIER_DEFAULTS[tier] };
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  for (const override of overrides) {
    if (featureKeys.includes(override.feature as FeatureKey)) {
      (defaults as Record<string, unknown>)[override.feature] = override.value;
    }
  }

  return defaults;
}
