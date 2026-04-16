'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrgSettings, updateOrgSettings } from './actions';
import type { OrgSettingsUpdates } from './actions';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';
import LogoUploader from '@/components/admin/LogoUploader';
import { getLogoUrl } from '@/lib/config/logo';
import MapDisplayConfigEditor from '@/components/admin/MapDisplayConfigEditor';
import type { MapDisplayConfig } from '@/lib/config/map-display';
import type { ItemType } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  community: 'Community',
  pro: 'Pro',
  municipal: 'Municipal',
};

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: 'bg-gray-100 text-gray-700',
  community: 'bg-blue-100 text-blue-700',
  pro: 'bg-forest/10 text-forest-dark',
  municipal: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past Due',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  trialing: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [pwaName, setPwaName] = useState('');
  const [themeJson, setThemeJson] = useState('');
  const [themeJsonError, setThemeJsonError] = useState('');
  const [mapDisplayConfig, setMapDisplayConfig] = useState<MapDisplayConfig | null>(null);
  const [allowPublicContributions, setAllowPublicContributions] = useState(false);
  const [moderationMode, setModerationMode] = useState<'auto_approve' | 'manual_review'>('manual_review');

  const { data: settings, isLoading: loading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const result = await getOrgSettings();
      if (result.error) {
        setMessage(`Error: ${result.error}`);
        return null;
      }
      return result.data ?? null;
    },
  });

  const { data: itemTypes = [] } = useQuery({
    queryKey: ['admin', 'itemTypes'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: org } = await supabase.from('orgs').select('id').limit(1).single();
      if (!org) return [];
      const { data } = await supabase.from('item_types').select('*').eq('org_id', org.id).order('name');
      return (data ?? []) as ItemType[];
    },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true;
      setName(settings.name ?? '');
      setSlug(settings.slug ?? '');
      setTagline(settings.tagline ?? '');
      setPwaName(settings.pwa_name ?? '');
      setThemeJson(settings.theme ? JSON.stringify(settings.theme, null, 2) : '');
      setMapDisplayConfig(settings.map_display_config as MapDisplayConfig | null);
      setAllowPublicContributions(settings.allow_public_contributions ?? false);
      setModerationMode(settings.moderation_mode ?? 'manual_review');
    }
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setThemeJsonError('');

    // Parse theme JSON if provided
    let parsedTheme: unknown = undefined;
    if (themeJson.trim()) {
      try {
        parsedTheme = JSON.parse(themeJson);
      } catch {
        setThemeJsonError('Invalid JSON — please fix before saving.');
        return;
      }
    }

    const updates: OrgSettingsUpdates = {};
    if (settings) {
      if (name !== settings.name) updates.name = name;
      if (slug !== settings.slug) updates.slug = slug;
      if (tagline !== (settings.tagline ?? '')) updates.tagline = tagline;
      if (pwaName !== (settings.pwa_name ?? '')) updates.pwa_name = pwaName;
      const currentThemeStr = settings.theme ? JSON.stringify(settings.theme) : '';
      const newThemeStr = parsedTheme !== undefined ? JSON.stringify(parsedTheme) : '';
      if (newThemeStr !== currentThemeStr) updates.theme = parsedTheme ?? null;
    }

    const currentMapConfig = JSON.stringify(settings?.map_display_config ?? null);
    const newMapConfig = JSON.stringify(mapDisplayConfig);
    if (newMapConfig !== currentMapConfig) updates.map_display_config = mapDisplayConfig;
    if (allowPublicContributions !== (settings?.allow_public_contributions ?? false))
      updates.allow_public_contributions = allowPublicContributions;
    if (moderationMode !== (settings?.moderation_mode ?? 'manual_review'))
      updates.moderation_mode = moderationMode;

    setSaving(true);
    setMessage('');
    const result = await updateOrgSettings(updates);
    setSaving(false);

    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setMessage('Settings saved!');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      router.refresh();
      setTimeout(() => setMessage(''), 3000);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-4 bg-sage-light rounded w-full" />
          <div className="h-4 bg-sage-light rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Org Settings
      </h1>

      {/* Status message */}
      {message && (
        <div
          className={`mb-6 rounded-lg px-3 py-2 text-sm ${
            message.startsWith('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* General section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            General
          </h2>

          <div>
            <label htmlFor="org-name" className="label">
              Org Name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div>
            <label htmlFor="org-slug" className="label">
              Slug
            </label>
            <input
              id="org-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="input-field"
              placeholder="my-org"
              required
            />
            <p className="mt-1 text-xs text-sage">
              Lowercase letters, numbers, and hyphens only (e.g.{' '}
              <code className="font-mono">my-org</code>). Used in URLs.
            </p>
          </div>

          <div>
            <label htmlFor="org-tagline" className="label">
              Tagline
            </label>
            <input
              id="org-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="input-field"
              placeholder="A short description of your org"
            />
          </div>

          <div>
            <label htmlFor="org-pwa-name" className="label">
              PWA App Name
            </label>
            <input
              id="org-pwa-name"
              type="text"
              value={pwaName}
              onChange={(e) => setPwaName(e.target.value)}
              className="input-field"
              placeholder={settings?.name ?? 'My App'}
            />
            <p className="mt-1 text-xs text-sage">
              Custom name shown when installed as a mobile app. Leave blank to
              use the org name.
            </p>
          </div>
        </section>

        {/* Appearance section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Appearance
          </h2>

          <div>
            <label className="label">Logo</label>
            <LogoUploader
              currentLogoUrl={settings?.logo_url ? getLogoUrl(settings.logo_url, 'original.png') : null}
              scope="org"
              orgId={settings?.id ?? ''}
              onUploaded={async () => {
                await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
                router.refresh();
              }}
            />
          </div>

          <div>
            <label htmlFor="org-theme" className="label">
              Theme (JSON)
            </label>
            <textarea
              id="org-theme"
              value={themeJson}
              onChange={(e) => {
                setThemeJson(e.target.value);
                setThemeJsonError('');
              }}
              className={`input-field min-h-[140px] font-mono text-sm ${
                themeJsonError ? 'border-red-400 focus:ring-red-300' : ''
              }`}
              placeholder={'{\n  "preset": "forest"\n}'}
            />
            {themeJsonError && (
              <p className="mt-1 text-xs text-red-600">{themeJsonError}</p>
            )}
            <p className="mt-1 text-xs text-sage">
              Advanced: raw theme configuration as JSON. Leave blank to use the
              default theme.
            </p>
          </div>
        </section>

        {/* Map Display section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Map Display
          </h2>
          <p className="text-xs text-sage">
            Configure which controls appear on the map. These defaults apply to all properties unless overridden.
          </p>
          <MapDisplayConfigEditor
            value={mapDisplayConfig}
            onChange={setMapDisplayConfig}
            itemTypes={itemTypes}
          />
        </section>

        {/* Public Contributions section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Public Contributions
          </h2>
          <p className="text-xs text-sage">
            Allow members of the public to submit new items on the map. Submissions are always reviewed before they appear publicly.
          </p>

          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="allow-public-contributions" className="label mb-0">
                Allow public contributions
              </label>
              <p className="text-xs text-sage mt-0.5">
                When enabled, non-authenticated visitors can submit items for review.
              </p>
            </div>
            <button
              type="button"
              id="allow-public-contributions"
              role="switch"
              aria-checked={allowPublicContributions}
              onClick={() => setAllowPublicContributions((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-forest focus:ring-offset-2 ${
                allowPublicContributions ? 'bg-forest' : 'bg-gray-200'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  allowPublicContributions ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {allowPublicContributions && (
            <div>
              <label htmlFor="moderation-mode" className="label">
                Review mode
              </label>
              <select
                id="moderation-mode"
                value={moderationMode}
                onChange={(e) => setModerationMode(e.target.value as 'auto_approve' | 'manual_review')}
                className="input-field"
              >
                <option value="manual_review">Always require admin approval</option>
                <option value="auto_approve">Auto-approve after AI safety check</option>
              </select>
              <p className="mt-1 text-xs text-sage">
                {moderationMode === 'manual_review'
                  ? 'Every submission will be held for an admin to approve or reject before it appears on the map.'
                  : 'Submissions that pass the AI content-safety check are published automatically. Those that fail are held for admin review.'}
              </p>
            </div>
          )}
        </section>

        {/* Subscription section (read-only) */}
        <section className="card space-y-4">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Subscription
          </h2>

          {settings ? (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  TIER_COLORS[settings.subscription_tier]
                }`}
              >
                {TIER_LABELS[settings.subscription_tier]}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  STATUS_COLORS[settings.subscription_status]
                }`}
              >
                {STATUS_LABELS[settings.subscription_status]}
              </span>
            </div>
          ) : (
            <div className="text-sm text-sage">Loading…</div>
          )}

          <p className="text-xs text-sage">
            Managed by platform admin. Contact support to change your plan.
          </p>
        </section>

        {/* Save button */}
        <div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
