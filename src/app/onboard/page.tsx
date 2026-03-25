'use client';

import { useState, useEffect } from 'react';
import PlatformNav from '@/components/platform/PlatformNav';
import { createClient } from '@/lib/supabase/client';
import { onboardCreateOrg } from './actions';
import { THEME_PRESETS } from '@/lib/config/themes';

type Step = 'welcome' | 'name' | 'theme' | 'custommap' | 'items' | 'about' | 'review';
const STEPS: Step[] = ['welcome', 'name', 'theme', 'custommap', 'items', 'about', 'review'];

interface ItemTypeEntry {
  name: string;
  icon: string;
  color: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function OnboardPage() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [tagline, setTagline] = useState('');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState(64.8378);
  const [lng, setLng] = useState(-147.7164);
  const [zoom, setZoom] = useState(13);
  const [themePreset, setThemePreset] = useState('forest');
  const [itemTypes, setItemTypes] = useState<ItemTypeEntry[]>([
    { name: 'Bird Box', icon: '\u{1F3E0}', color: '#5D7F3A' },
  ]);
  const [aboutContent, setAboutContent] = useState('# About\n\nDescribe your project here.');

  // Guard: redirect if user already has an org
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('org_memberships')
        .select('orgs(slug)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data?.orgs) {
            window.location.href = '/';
          } else {
            setReady(true);
          }
        });
    });
  }, []);

  const stepIndex = STEPS.indexOf(step);
  const isLast = stepIndex === STEPS.length - 1;

  function next() {
    if (stepIndex < STEPS.length - 1) {
      setError('');
      setStep(STEPS[stepIndex + 1]);
    }
  }

  function back() {
    if (stepIndex > 0) {
      setError('');
      setStep(STEPS[stepIndex - 1]);
    }
  }

  function validateCurrentStep(): boolean {
    switch (step) {
      case 'name':
        if (!orgName.trim()) { setError('Organization name is required.'); return false; }
        if (!orgSlug.trim()) { setError('URL slug is required.'); return false; }
        return true;
      case 'items':
        if (itemTypes.length === 0 || !itemTypes[0].name.trim()) {
          setError('At least one item type is required.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (validateCurrentStep()) {
      next();
    }
  }

  function handleOrgNameChange(name: string) {
    setOrgName(name);
    if (!slugManuallyEdited) {
      setOrgSlug(toSlug(name));
    }
  }

  async function handleLaunch() {
    setSaving(true);
    setError('');

    try {
      const result = await onboardCreateOrg({
        orgName,
        orgSlug,
        tagline,
        locationName,
        lat,
        lng,
        zoom,
        themePreset,
        itemTypes: itemTypes.filter((t) => t.name.trim()),
        aboutContent,
      });

      if ('error' in result) {
        throw new Error(result.error);
      }

      const platformDomain =
        process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || window.location.hostname;
      window.location.href = `https://${result.orgSlug}.${platformDomain}/admin`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-white">
        <PlatformNav minimal />
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PlatformNav minimal />

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Progress indicator */}
        {step !== 'welcome' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                Step {stepIndex} of {STEPS.length - 1}
              </span>
              <span className="text-xs text-gray-500 capitalize">{step}</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content card */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-8">
          {step === 'welcome' && (
            <div className="text-center py-8">
              <span className="text-5xl mb-4 block">{'\u{1F30D}'}</span>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                Let&apos;s set up your organization
              </h1>
              <p className="text-gray-500 max-w-md mx-auto mb-8">
                We&apos;ll walk you through naming your org, choosing a theme,
                configuring item types, and launching your mapping project.
              </p>
              <button
                onClick={next}
                className="rounded-lg bg-indigo-600 px-8 py-3 text-lg font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                Get Started
              </button>
            </div>
          )}

          {step === 'name' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Name &amp; Location
              </h2>
              <div>
                <label htmlFor="onboard-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Organization Name *
                </label>
                <input
                  id="onboard-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Fairbanks Bird Watchers"
                />
              </div>
              <div>
                <label htmlFor="onboard-slug" className="block text-sm font-medium text-gray-700 mb-1">
                  URL Slug *
                </label>
                <input
                  id="onboard-slug"
                  type="text"
                  value={orgSlug}
                  onChange={(e) => {
                    setOrgSlug(toSlug(e.target.value));
                    setSlugManuallyEdited(true);
                  }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="fairbanks-bird-watchers"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Your site: <span className="font-medium text-indigo-600">{orgSlug || 'slug'}</span>.fieldmapper.org
                </p>
              </div>
              <div>
                <label htmlFor="onboard-tagline" className="block text-sm font-medium text-gray-700 mb-1">
                  Tagline
                </label>
                <input
                  id="onboard-tagline"
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Monitoring nest boxes since 2020"
                />
              </div>
              <div>
                <label htmlFor="onboard-location" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Name
                </label>
                <input
                  id="onboard-location"
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="e.g., Fairbanks, AK"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="onboard-lat" className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    id="onboard-lat"
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-lng" className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    id="onboard-lng"
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="onboard-zoom" className="block text-sm font-medium text-gray-700 mb-1">
                    Zoom
                  </label>
                  <input
                    id="onboard-zoom"
                    type="number"
                    min="1"
                    max="20"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'theme' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Choose a Theme
              </h2>
              <p className="text-sm text-gray-500">
                Pick a color scheme for your site. You can customize colors later in settings.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(THEME_PRESETS).map(([key, theme]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setThemePreset(key)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      themePreset === key
                        ? 'border-indigo-600 ring-2 ring-indigo-100'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-3">
                      {Object.values(theme.colors).slice(0, 4).map((color, i) => (
                        <div
                          key={i}
                          className="w-8 h-8 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: color as string }}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'custommap' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Custom Map Overlay
              </h2>
              <p className="text-sm text-gray-500">
                You can upload a park map, trail map, or facility diagram to overlay on the base map.
                This can be configured later in your org settings.
              </p>
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                <span className="text-3xl block mb-3">{'\u{1F5FA}\uFE0F'}</span>
                <p className="text-sm text-gray-500 mb-2">
                  Custom map overlay support coming soon.
                </p>
                <p className="text-xs text-gray-400">
                  Click Next to skip this step for now.
                </p>
              </div>
            </div>
          )}

          {step === 'items' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Item Types
              </h2>
              <p className="text-sm text-gray-500">
                What kinds of things will you track? Add at least one type.
                You can add more later in settings.
              </p>
              <div className="space-y-4">
                {itemTypes.map((type, i) => (
                  <div key={i} className="flex gap-3 items-start p-4 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={type.name}
                        onChange={(e) => {
                          const updated = [...itemTypes];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setItemTypes(updated);
                        }}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="Type name (e.g., Bird Box)"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={type.icon}
                          onChange={(e) => {
                            const updated = [...itemTypes];
                            updated[i] = { ...updated[i], icon: e.target.value };
                            setItemTypes(updated);
                          }}
                          className="w-20 text-center text-lg rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                          placeholder="\u{1F3E0}"
                          maxLength={4}
                        />
                        <input
                          type="color"
                          value={type.color}
                          onChange={(e) => {
                            const updated = [...itemTypes];
                            updated[i] = { ...updated[i], color: e.target.value };
                            setItemTypes(updated);
                          }}
                          className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                        />
                      </div>
                    </div>
                    {itemTypes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItemTypes(itemTypes.filter((_, j) => j !== i))}
                        className="text-red-500 hover:text-red-700 text-sm mt-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setItemTypes([...itemTypes, { name: '', icon: '\u{1F4CD}', color: '#5D7F3A' }])}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                + Add Another Type
              </button>
            </div>
          )}

          {step === 'about' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                About Page
              </h2>
              <p className="text-sm text-gray-500">
                Write a description for your project. You can use Markdown formatting.
              </p>
              <textarea
                value={aboutContent}
                onChange={(e) => setAboutContent(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 min-h-[200px] font-mono"
                placeholder="# About&#10;&#10;Describe your project here..."
              />
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Review &amp; Launch
              </h2>
              <p className="text-sm text-gray-500">
                Here&apos;s a summary of your settings. Click Launch to go live!
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Organization</span>
                  <span className="text-gray-900 font-medium">{orgName || '\u2014'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">URL</span>
                  <span className="text-indigo-600 font-medium">{orgSlug || '\u2014'}.fieldmapper.org</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Tagline</span>
                  <span className="text-gray-900">{tagline || '\u2014'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Location</span>
                  <span className="text-gray-900">{locationName || '\u2014'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Theme</span>
                  <span className="text-gray-900 capitalize">{themePreset}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Item Types</span>
                  <span className="text-gray-900">
                    {itemTypes.filter((t) => t.name.trim()).map((t) => `${t.icon} ${t.name}`).join(', ') || '\u2014'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step !== 'welcome' && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Back
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-8 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Setting up...' : 'Launch'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
