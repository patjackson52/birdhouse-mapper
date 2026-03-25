'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOrgSettings, updateOrgSettings } from './actions';
import type { OrgSettings, OrgSettingsUpdates } from './actions';
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/types';

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
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [themeJson, setThemeJson] = useState('');
  const [themeJsonError, setThemeJsonError] = useState('');

  useEffect(() => {
    async function load() {
      const result = await getOrgSettings();
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else if (result.data) {
        const s = result.data;
        setSettings(s);
        setName(s.name ?? '');
        setSlug(s.slug ?? '');
        setTagline(s.tagline ?? '');
        setLogoUrl(s.logo_url ?? '');
        setThemeJson(s.theme ? JSON.stringify(s.theme, null, 2) : '');
      }
      setLoading(false);
    }
    load();
  }, []);

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
      if (logoUrl !== (settings.logo_url ?? '')) updates.logo_url = logoUrl;
      const currentThemeStr = settings.theme ? JSON.stringify(settings.theme) : '';
      const newThemeStr = parsedTheme !== undefined ? JSON.stringify(parsedTheme) : '';
      if (newThemeStr !== currentThemeStr) updates.theme = parsedTheme ?? null;
    }

    setSaving(true);
    setMessage('');
    const result = await updateOrgSettings(updates);
    setSaving(false);

    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setMessage('Settings saved!');
      // Refresh local settings snapshot
      const fresh = await getOrgSettings();
      if (fresh.data) setSettings(fresh.data);
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
        </section>

        {/* Appearance section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Appearance
          </h2>

          <div>
            <label htmlFor="org-logo" className="label">
              Logo URL
            </label>
            <input
              id="org-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="input-field"
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-1 text-xs text-sage">
              Full URL to your logo image. Direct upload support coming soon.
            </p>
            {logoUrl && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-12 object-contain rounded border border-sage-light"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
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
