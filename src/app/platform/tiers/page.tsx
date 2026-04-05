import { PLATFORM_FEATURES, TIER_DEFAULTS, type FeatureKey } from '@/lib/platform/features';
import type { SubscriptionTier } from '@/lib/types';

const TIERS: SubscriptionTier[] = ['free', 'community', 'pro', 'municipal'];

function formatValue(val: boolean | number | null): string {
  if (val === null) return '∞';
  if (typeof val === 'boolean') return val ? '✓' : '—';
  return String(val);
}

export default function TierReferencePage() {
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
        Tier Reference
      </h1>
      <p className="text-sm text-sage mb-6">
        Default feature values for each subscription tier. These are defined in code.
        Per-org overrides can be set on the org detail page.
      </p>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Feature</th>
                {TIERS.map((tier) => (
                  <th key={tier} className="text-center px-4 py-3 text-xs font-medium text-sage uppercase capitalize">
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {featureKeys.map((key) => (
                <tr key={key} className="hover:bg-sage-light/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-forest-dark">{PLATFORM_FEATURES[key].label}</td>
                  {TIERS.map((tier) => {
                    const val = TIER_DEFAULTS[tier][key];
                    return (
                      <td
                        key={tier}
                        className={`px-4 py-3 text-sm text-center ${
                          val === true ? 'text-green-600 font-medium' :
                          val === false ? 'text-sage' :
                          val === null ? 'text-forest-dark font-medium' :
                          'text-forest-dark'
                        }`}
                      >
                        {formatValue(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
