'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setupSaveConfig,
  setupCreateAdmin,
  setupCreateItemType,
  setupClearItemTypes,
  setupComplete,
  setupSaveLandingPage,
} from './actions';
import { THEME_PRESETS } from '@/lib/config/themes';
import dynamic from 'next/dynamic';

const OverlayEditor = dynamic(() => import('@/components/manage/OverlayEditor'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading overlay editor...
    </div>
  ),
});

type Step = 'welcome' | 'name' | 'theme' | 'custommap' | 'items' | 'about' | 'admin' | 'review';

const STEPS: Step[] = ['welcome', 'name', 'theme', 'custommap', 'items', 'about', 'admin', 'review'];

interface ItemTypeEntry {
  name: string;
  icon: string;
  color: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state persisted across steps
  const [siteName, setSiteName] = useState('');
  const [tagline, setTagline] = useState('');
  const [locationName, setLocationName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [zoom, setZoom] = useState('14');
  const [themePreset, setThemePreset] = useState('forest');
  const [itemTypes, setItemTypes] = useState<ItemTypeEntry[]>([
    { name: 'Bird Box', icon: '🏠', color: '#5D7F3A' },
  ]);
  const [overlayConfig, setOverlayConfig] = useState<{
    url: string;
    bounds: { southWest: { lat: number; lng: number }; northEast: { lat: number; lng: number } };
    rotation: number;
    opacity: number;
  } | null>(null);
  const [aboutContent, setAboutContent] = useState('# About\n\nDescribe your project here.');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');

  const stepIndex = STEPS.indexOf(step);
  const isFirst = stepIndex === 0;
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
        if (!siteName.trim()) { setError('Site name is required.'); return false; }
        return true;
      case 'items':
        if (itemTypes.length === 0 || !itemTypes[0].name.trim()) {
          setError('At least one item type is required.');
          return false;
        }
        return true;
      case 'admin':
        if (!adminEmail.trim()) { setError('Email is required.'); return false; }
        if (adminPassword.length < 6) { setError('Password must be at least 6 characters.'); return false; }
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

  async function handleLaunch() {
    setSaving(true);
    setError('');

    try {
      // 1. Save config
      const configResult = await setupSaveConfig([
        { key: 'site_name', value: siteName },
        { key: 'tagline', value: tagline },
        { key: 'location_name', value: locationName },
        { key: 'map_center', value: {
          lat: lat ? Number(lat) : 0,
          lng: lng ? Number(lng) : 0,
          zoom: Number(zoom) || 14,
        }},
        { key: 'theme', value: { preset: themePreset } },
        { key: 'about_content', value: aboutContent },
        { key: 'custom_map', value: overlayConfig },
      ]);
      if (configResult.error) throw new Error(configResult.error);

      // 2. Clear any item types from previous attempts, then create new ones
      await setupClearItemTypes();
      for (let i = 0; i < itemTypes.length; i++) {
        const t = itemTypes[i];
        if (t.name.trim()) {
          const result = await setupCreateItemType(t.name, t.icon, t.color, i);
          if (result.error) throw new Error(`Item type "${t.name}": ${result.error}`);
        }
      }

      // 3. Create admin account
      const adminResult = await setupCreateAdmin(adminEmail, adminPassword, adminName);
      if (adminResult.error) throw new Error(adminResult.error);

      // 4. Create default landing page
      await setupSaveLandingPage(siteName, tagline, locationName);

      // 5. Mark setup complete
      const completeResult = await setupComplete();
      if (completeResult.error) throw new Error(completeResult.error);

      // Redirect to home
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        {step !== 'welcome' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-sage">
                Step {stepIndex} of {STEPS.length - 1}
              </span>
              <span className="text-xs text-sage capitalize">{step}</span>
            </div>
            <div className="h-1.5 bg-sage-light rounded-full overflow-hidden">
              <div
                className="h-full bg-forest rounded-full transition-all duration-300"
                style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="card">
          {step === 'welcome' && (
            <div className="text-center py-8">
              <span className="text-5xl mb-4 block">📍</span>
              <h1 className="font-heading text-3xl font-semibold text-forest-dark mb-3">
                Welcome to Field Mapper
              </h1>
              <p className="text-sage max-w-md mx-auto mb-8">
                Let&apos;s set up your mapping project. This wizard will guide you through
                naming your site, choosing a theme, and creating your first item types.
              </p>
              <button onClick={next} className="btn-primary text-lg px-8 py-3">
                Get Started
              </button>
            </div>
          )}

          {step === 'name' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Name & Location
              </h2>
              <div>
                <label htmlFor="setup-name" className="label">Site Name *</label>
                <input
                  id="setup-name"
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Springbrook Creek Preserve"
                />
              </div>
              <div>
                <label htmlFor="setup-tagline" className="label">Tagline</label>
                <input
                  id="setup-tagline"
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Eagle Scout Project"
                />
              </div>
              <div>
                <label htmlFor="setup-location" className="label">Location Name</label>
                <input
                  id="setup-location"
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Bainbridge Island, WA"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="setup-lat" className="label">Latitude</label>
                  <input
                    id="setup-lat"
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="input-field"
                    placeholder="47.62"
                  />
                </div>
                <div>
                  <label htmlFor="setup-lng" className="label">Longitude</label>
                  <input
                    id="setup-lng"
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="input-field"
                    placeholder="-122.52"
                  />
                </div>
                <div>
                  <label htmlFor="setup-zoom" className="label">Zoom</label>
                  <input
                    id="setup-zoom"
                    type="number"
                    min="1"
                    max="20"
                    value={zoom}
                    onChange={(e) => setZoom(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'theme' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Choose a Theme
              </h2>
              <p className="text-sm text-sage">
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
                        ? 'border-forest ring-2 ring-sage-light'
                        : 'border-sage-light hover:border-sage'
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
                    <span className="text-sm font-medium text-forest-dark">{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'custommap' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Custom Map Overlay
              </h2>
              <p className="text-sm text-sage">
                Optionally upload a park map, trail map, or facility diagram to overlay on the base map.
                You can skip this step and add one later in settings.
              </p>
              <OverlayEditor
                initialConfig={overlayConfig}
                onSave={(config) => setOverlayConfig(config)}
                saving={false}
              />
              {overlayConfig && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                  Overlay configured! Click Next to continue.
                </div>
              )}
            </div>
          )}

          {step === 'items' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Item Types
              </h2>
              <p className="text-sm text-sage">
                What kinds of things will you track? Add at least one type.
                You can add more later in settings.
              </p>
              <div className="space-y-4">
                {itemTypes.map((type, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-sage-light">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={type.name}
                        onChange={(e) => {
                          const updated = [...itemTypes];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setItemTypes(updated);
                        }}
                        className="input-field"
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
                          className="input-field w-20 text-center text-lg"
                          placeholder="🏠"
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
                          className="h-10 w-16 rounded border border-sage-light cursor-pointer"
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
                onClick={() => setItemTypes([...itemTypes, { name: '', icon: '📍', color: '#5D7F3A' }])}
                className="text-sm text-forest hover:text-forest-dark transition-colors"
              >
                + Add Another Type
              </button>
            </div>
          )}

          {step === 'about' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                About Page
              </h2>
              <p className="text-sm text-sage">
                Write a description for your project. You can use Markdown headings (## Heading).
              </p>
              <textarea
                value={aboutContent}
                onChange={(e) => setAboutContent(e.target.value)}
                className="input-field min-h-[200px] font-mono text-sm"
                placeholder="# About&#10;&#10;Describe your project here..."
              />
            </div>
          )}

          {step === 'admin' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Admin Account
              </h2>
              <p className="text-sm text-sage">
                Create the first administrator account. You can add more users later.
              </p>
              <div>
                <label htmlFor="setup-admin-name" className="label">Display Name</label>
                <input
                  id="setup-admin-name"
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="setup-admin-email" className="label">Email *</label>
                <input
                  id="setup-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label htmlFor="setup-admin-password" className="label">Password *</label>
                <input
                  id="setup-admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="input-field"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <h2 className="font-heading text-xl font-semibold text-forest-dark">
                Review & Launch
              </h2>
              <p className="text-sm text-sage">
                Here&apos;s a summary of your settings. Click Launch to go live!
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Site Name</span>
                  <span className="text-forest-dark font-medium">{siteName || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Tagline</span>
                  <span className="text-forest-dark">{tagline || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Location</span>
                  <span className="text-forest-dark">{locationName || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Theme</span>
                  <span className="text-forest-dark capitalize">{themePreset}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Custom Map</span>
                  <span className="text-forest-dark">{overlayConfig ? 'Configured' : 'None'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Item Types</span>
                  <span className="text-forest-dark">
                    {itemTypes.filter((t) => t.name.trim()).map((t) => `${t.icon} ${t.name}`).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-sage-light">
                  <span className="text-sage">Admin</span>
                  <span className="text-forest-dark">{adminEmail}</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step !== 'welcome' && (
            <div className="flex justify-between mt-8 pt-6 border-t border-sage-light">
              <button
                type="button"
                onClick={back}
                className="btn-secondary"
                disabled={saving}
              >
                Back
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={saving}
                  className="btn-primary px-8"
                >
                  {saving ? 'Setting up...' : '🚀 Launch'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn-primary"
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
