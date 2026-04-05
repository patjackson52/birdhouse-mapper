'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_FEATURES, TIER_DEFAULTS, type FeatureKey } from '@/lib/platform/features';
import { updateOrg, setFeatureOverride, removeFeatureOverride } from '../../actions';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  logo_url: string | null;
  created_at: string;
};

type PropertyRow = { id: string; name: string; slug: string; is_active: boolean };

type Override = {
  feature: string;
  value: unknown;
  note: string | null;
};

const TIERS: SubscriptionTier[] = ['free', 'community', 'pro', 'municipal'];
const STATUSES: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'cancelled'];

export default function PlatformOrgDetailPage() {
  const params = useParams<{ slug: string }>();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable org fields
  const [editTier, setEditTier] = useState<SubscriptionTier>('free');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active');

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const { data: orgData } = await supabase
      .from('orgs')
      .select('id, name, slug, subscription_tier, subscription_status, logo_url, created_at')
      .eq('slug', params.slug)
      .single();

    if (!orgData) {
      setLoading(false);
      return;
    }

    setOrg(orgData as OrgDetail);
    setEditTier(orgData.subscription_tier as SubscriptionTier);
    setEditStatus(orgData.subscription_status as SubscriptionStatus);

    const [membersRes, propsRes, overridesRes] = await Promise.all([
      supabase
        .from('org_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgData.id)
        .eq('status', 'active'),
      supabase
        .from('properties')
        .select('id, name, slug, is_active')
        .eq('org_id', orgData.id)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('org_feature_overrides')
        .select('feature, value, note')
        .eq('org_id', orgData.id),
    ]);

    setMemberCount(membersRes.count ?? 0);
    setProperties(propsRes.data ?? []);
    setOverrides((overridesRes.data ?? []) as Override[]);
    setLoading(false);
  }, [params.slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleSaveOrg() {
    if (!org) return;
    setSaving(true);
    const result = await updateOrg(org.id, {
      subscription_tier: editTier,
      subscription_status: editStatus,
    });
    setSaving(false);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      showMessage('success', 'Org updated');
      fetchData();
    }
  }

  async function handleSetOverride(feature: FeatureKey, value: unknown, note?: string) {
    if (!org) return;
    const result = await setFeatureOverride(org.id, feature, value, note);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      fetchData();
    }
  }

  async function handleRemoveOverride(feature: FeatureKey) {
    if (!org) return;
    const result = await removeFeatureOverride(org.id, feature);
    if (result.error) {
      showMessage('error', result.error);
    } else {
      fetchData();
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-64" />
          <div className="h-48 bg-sage-light rounded" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sage">Organization not found.</p>
        <Link href="/platform/orgs" className="text-sm text-golden hover:underline mt-2 inline-block">
          ← Back to organizations
        </Link>
      </div>
    );
  }

  const tierDefaults = TIER_DEFAULTS[editTier];
  const overrideMap = new Map(overrides.map((o) => [o.feature, o]));
  const featureKeys = Object.keys(PLATFORM_FEATURES) as FeatureKey[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/platform/orgs" className="text-sm text-golden hover:underline mb-4 inline-block">
        ← Back to organizations
      </Link>

      {/* Status message */}
      {message && (
        <div className={`mb-4 p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">{org.name}</h1>

      {/* Info card */}
      <div className="card p-4 mb-6">
        <h2 className="font-heading text-sm font-semibold text-forest-dark mb-4">Organization Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <p className="text-sm text-forest-dark">{org.name}</p>
          </div>
          <div>
            <label className="label">Slug</label>
            <p className="text-sm text-forest-dark">{org.slug}</p>
          </div>
          <div>
            <label className="label">Tier</label>
            <select
              value={editTier}
              onChange={(e) => setEditTier(e.target.value as SubscriptionTier)}
              className="input-field"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}
              className="input-field"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Created</label>
            <p className="text-sm text-forest-dark">{new Date(org.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        {(editTier !== org.subscription_tier || editStatus !== org.subscription_status) && (
          <div className="mt-4 flex gap-2">
            <button onClick={handleSaveOrg} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => { setEditTier(org.subscription_tier); setEditStatus(org.subscription_status); }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Members</p>
          <p className="text-2xl font-semibold text-forest-dark">{memberCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-sage uppercase tracking-wide mb-1">Properties</p>
          <p className="text-2xl font-semibold text-forest-dark">{properties.length}</p>
        </div>
      </div>

      {properties.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="font-heading text-sm font-semibold text-forest-dark mb-3">Properties</h2>
          <div className="space-y-2">
            {properties.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-forest-dark">{p.name} <span className="text-sage">({p.slug})</span></span>
                <span className={p.is_active ? 'text-green-600' : 'text-sage'}>{p.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature overrides */}
      <div className="card p-4">
        <h2 className="font-heading text-sm font-semibold text-forest-dark mb-4">Feature Configuration</h2>
        <p className="text-xs text-sage mb-4">
          Showing resolved features for <span className="capitalize font-medium">{editTier}</span> tier.
          Toggle overrides to customize this org.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light">
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Feature</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Tier Default</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Override</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Resolved</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-sage uppercase">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {featureKeys.map((key) => {
                const def = PLATFORM_FEATURES[key];
                const tierDefault = tierDefaults[key];
                const override = overrideMap.get(key);
                const resolved = override ? override.value : tierDefault;
                const hasOverride = override !== undefined;

                return (
                  <FeatureRow
                    key={key}
                    featureKey={key}
                    label={def.label}
                    type={def.type}
                    tierDefault={tierDefault}
                    override={override ?? null}
                    resolved={resolved}
                    hasOverride={hasOverride}
                    onSetOverride={(value, note) => handleSetOverride(key, value, note)}
                    onRemoveOverride={() => handleRemoveOverride(key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  featureKey,
  label,
  type,
  tierDefault,
  override,
  resolved,
  hasOverride,
  onSetOverride,
  onRemoveOverride,
}: {
  featureKey: string;
  label: string;
  type: 'boolean' | 'numeric';
  tierDefault: boolean | number | null;
  override: Override | null;
  resolved: unknown;
  hasOverride: boolean;
  onSetOverride: (value: unknown, note?: string) => void;
  onRemoveOverride: () => void;
}) {
  // Local state for text/numeric inputs — saves on blur, not every keystroke
  const [localNote, setLocalNote] = useState(override?.note ?? '');
  const [localNumeric, setLocalNumeric] = useState(
    override?.value === null ? '' : String(override?.value ?? ''),
  );

  // Sync local state when override changes from parent (e.g., after refetch)
  useEffect(() => {
    setLocalNote(override?.note ?? '');
    setLocalNumeric(override?.value === null ? '' : String(override?.value ?? ''));
  }, [override?.note, override?.value]);

  function formatValue(val: unknown): string {
    if (val === null) return 'unlimited';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  }

  return (
    <tr>
      <td className="px-3 py-2 text-sm text-forest-dark">{label}</td>
      <td className="px-3 py-2 text-sm text-sage">{formatValue(tierDefault)}</td>
      <td className="px-3 py-2">
        {hasOverride ? (
          <div className="flex items-center gap-2">
            {type === 'boolean' ? (
              <button
                onClick={() => onSetOverride(!(override!.value as boolean))}
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  override!.value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {override!.value ? 'true' : 'false'}
              </button>
            ) : (
              <input
                type="number"
                value={localNumeric}
                onChange={(e) => setLocalNumeric(e.target.value)}
                onBlur={() => {
                  const val = localNumeric === '' ? null : Number(localNumeric);
                  onSetOverride(val, override!.note ?? undefined);
                }}
                placeholder="unlimited"
                className="input-field w-24 text-xs py-1"
              />
            )}
            <button
              onClick={onRemoveOverride}
              className="text-xs text-red-500 hover:text-red-700"
              title="Remove override"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (type === 'boolean') {
                onSetOverride(!(tierDefault as boolean));
              } else {
                onSetOverride(tierDefault);
              }
            }}
            className="text-xs text-golden hover:underline"
          >
            + Override
          </button>
        )}
      </td>
      <td className={`px-3 py-2 text-sm font-medium ${hasOverride ? 'text-forest-dark' : 'text-sage'}`}>
        {formatValue(resolved)}
      </td>
      <td className="px-3 py-2">
        {hasOverride ? (
          <input
            type="text"
            value={localNote}
            onChange={(e) => setLocalNote(e.target.value)}
            onBlur={() => onSetOverride(override!.value, localNote || undefined)}
            placeholder="Add note..."
            className="input-field text-xs py-1 w-full"
          />
        ) : (
          <span className="text-sage text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
