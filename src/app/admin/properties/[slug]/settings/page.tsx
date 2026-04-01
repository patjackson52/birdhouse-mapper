'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useConfig } from '@/lib/config/client';
import { useRouter, useParams } from 'next/navigation';
import { saveConfig, saveConfigValue } from './actions';
import { THEME_PRESETS } from '@/lib/config/themes';
import { MAP_STYLES, MAP_STYLE_CATEGORIES, THEME_DEFAULT_MAP_STYLE } from '@/lib/config/map-styles';
import OverlayEditor from '@/components/manage/OverlayEditor';
import { createClient } from '@/lib/supabase/client';
import { getPropertyGeoLayers, setPropertyBoundary } from '@/app/admin/geo-layers/actions';
import LogoUploader from '@/components/admin/LogoUploader';
import { getLogoUrl } from '@/lib/config/logo';
import type { GeoLayerSummary, GeoLayerProperty } from '@/lib/geo/types';

const CenterPicker = dynamic(() => import('@/components/manage/CenterPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-sage-light rounded-lg flex items-center justify-center text-sm text-sage">
      Loading map...
    </div>
  ),
});

type SettingsTab = 'general' | 'appearance' | 'custommap' | 'geo-layers' | 'about' | 'footer';

export default function SettingsPage() {
  const config = useConfig();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [currentBoundaryId, setCurrentBoundaryId] = useState<string | null>(null);

  const { data: propertyId } = useQuery({
    queryKey: ['admin', 'property', slug, 'id'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('properties').select('id').eq('slug', slug).single();
      return data?.id ?? null;
    },
  });

  const { data: geoLayerData } = useQuery({
    queryKey: ['admin', 'property', slug, 'geo-layers'],
    queryFn: async () => {
      if (!propertyId) return { layers: [], assignments: [] };
      const result = await getPropertyGeoLayers(propertyId);
      if ('success' in result) {
        return { layers: result.layers, assignments: result.assignments };
      }
      return { layers: [], assignments: [] };
    },
    enabled: activeTab === 'geo-layers' && !!propertyId,
  });

  const propertyGeoLayers: GeoLayerSummary[] = geoLayerData?.layers ?? [];
  const layerAssignments: GeoLayerProperty[] = geoLayerData?.assignments ?? [];

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'custommap', label: 'Custom Map' },
    { id: 'geo-layers', label: 'Geo Layers' },
    { id: 'about', label: 'About Page' },
    { id: 'footer', label: 'Footer' },
  ];

  async function handleSave(entries: { key: string; value: unknown }[]) {
    setSaving(true);
    setMessage('');
    const result = await saveConfig(entries);
    setSaving(false);
    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setMessage('Settings saved!');
      router.refresh();
      setTimeout(() => setMessage(''), 3000);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 md:pb-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Site Settings
      </h1>

      {/* Status message */}
      {message && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${
          message.startsWith('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-sage-light overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-forest text-forest-dark'
                : 'border-transparent text-sage hover:text-forest-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && (
        <GeneralTab config={config} onSave={handleSave} saving={saving} />
      )}
      {activeTab === 'appearance' && (
        <div className="space-y-8">
          <AppearanceTab config={config} onSave={handleSave} saving={saving} />
          {propertyId && (
            <section className="card space-y-4">
              <h2 className="font-heading text-lg font-semibold text-forest-dark">Property Logo</h2>
              <p className="text-sm text-sage">
                Upload a logo for this property. Overrides the org-level logo for PWA icons and branding.
              </p>
              <LogoUploader
                currentLogoUrl={config.logoUrl ? getLogoUrl(config.logoUrl, 'original.png') : null}
                scope="property"
                propertyId={propertyId}
                onUploaded={() => {
                  router.refresh();
                }}
              />
            </section>
          )}
        </div>
      )}
      {activeTab === 'custommap' && (
        <div>
          <h2 className="font-heading text-xl font-semibold text-forest-dark mb-4">
            Custom Map Overlay
          </h2>
          <p className="text-sm text-sage mb-6">
            Upload an image (park map, trail map, facility diagram) to overlay on the base map.
            Click the map to place the southwest and northeast corners of your overlay.
          </p>
          <OverlayEditor
            initialConfig={config.customMap}
            onSave={async (overlayConfig) => {
              await handleSave([{ key: 'custom_map', value: overlayConfig }]);
            }}
            saving={saving}
          />
        </div>
      )}
      {activeTab === 'geo-layers' && (
        <div className="space-y-6">
          <div className="card p-4 space-y-2">
            <h3 className="font-medium">Property Boundary</h3>
            <p className="text-sm text-gray-500">Select a polygon layer to use as this property&apos;s boundary.</p>
            <select
              value={currentBoundaryId ?? ''}
              onChange={async (e) => {
                const value = e.target.value || null;
                setCurrentBoundaryId(value);
                if (propertyId) {
                  await setPropertyBoundary(propertyId, value);
                }
              }}
              className="input-field"
            >
              <option value="">None</option>
              {propertyGeoLayers
                .filter((l) => l.is_property_boundary)
                .map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
            </select>
          </div>

          <div>
            <h3 className="font-medium mb-2">Assigned Layers</h3>
            {propertyGeoLayers.length === 0 ? (
              <p className="text-sm text-gray-500">No layers assigned to this property.</p>
            ) : (
              <div className="space-y-2">
                {propertyGeoLayers.map((layer) => (
                  <div key={layer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: layer.color }} />
                      <div>
                        <div className="text-sm font-medium">{layer.name}</div>
                        <div className="text-xs text-gray-500">{layer.feature_count} features</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'about' && (
        <AboutTab config={config} onSave={handleSave} saving={saving} />
      )}
      {activeTab === 'footer' && (
        <FooterTab config={config} onSave={handleSave} saving={saving} />
      )}
    </div>
  );
}

// ======================
// General Tab
// ======================

function GeneralTab({ config, onSave, saving }: TabProps) {
  const [siteName, setSiteName] = useState(config.siteName);
  const [tagline, setTagline] = useState(config.tagline);
  const [pwaName, setPwaName] = useState(config.pwaName ?? '');
  const [locationName, setLocationName] = useState(config.locationName);
  const [lat, setLat] = useState(config.mapCenter.lat);
  const [lng, setLng] = useState(config.mapCenter.lng);
  const [zoom, setZoom] = useState(config.mapCenter.zoom);
  const [mapStyleId, setMapStyleId] = useState(config.mapStyle || '');

  const effectiveStyleId = mapStyleId || THEME_DEFAULT_MAP_STYLE[config.theme.preset] || 'osm';
  const activeStyle = MAP_STYLES[effectiveStyleId] || MAP_STYLES['osm'];

  // Group map styles by category
  const stylesByCategory = Object.entries(MAP_STYLES).reduce((acc, [id, style]) => {
    if (!acc[style.category]) acc[style.category] = [];
    acc[style.category].push({ id, ...style });
    return acc;
  }, {} as Record<string, (typeof MAP_STYLES[string] & { id: string })[]>);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave([
      { key: 'site_name', value: siteName },
      { key: 'tagline', value: tagline },
      { key: 'pwa_name', value: pwaName || null },
      { key: 'location_name', value: locationName },
      { key: 'map_center', value: { lat, lng, zoom } },
      { key: 'map_style', value: mapStyleId || null },
    ]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="site-name" className="label">Site Name</label>
        <input
          id="site-name"
          type="text"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="input-field"
        />
      </div>
      <div>
        <label htmlFor="tagline" className="label">Tagline</label>
        <input
          id="tagline"
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="input-field"
        />
      </div>
      <div>
        <label htmlFor="pwa-name" className="label">PWA App Name</label>
        <input
          id="pwa-name"
          type="text"
          value={pwaName}
          onChange={(e) => setPwaName(e.target.value)}
          className="input-field"
          placeholder={config.propertyName || config.siteName}
        />
        <p className="text-xs text-sage mt-1">
          Custom name shown when installed as a mobile app. Leave blank to use the property or org name.
        </p>
      </div>
      <div>
        <label htmlFor="location" className="label">Location Name</label>
        <input
          id="location"
          type="text"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className="input-field"
          placeholder="e.g., Bainbridge Island, WA"
        />
      </div>
      <div>
        <label className="label">Map Tile Style</label>
        <p className="text-xs text-sage mb-2">
          Choose a map background. The map preview below updates live.
        </p>
        <select
          value={mapStyleId}
          onChange={(e) => setMapStyleId(e.target.value)}
          className="input-field w-auto mb-4"
        >
          <option value="">
            Theme Default ({MAP_STYLES[THEME_DEFAULT_MAP_STYLE[config.theme.preset] || 'osm']?.name})
          </option>
          {Object.entries(stylesByCategory).map(([category, styles]) => (
            <optgroup key={category} label={MAP_STYLE_CATEGORIES[category]}>
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Default Map View</label>
        <p className="text-xs text-sage mb-2">
          Pan, zoom, and click to set the default location shown when the map first loads.
        </p>
        <CenterPicker
          lat={lat}
          lng={lng}
          zoom={zoom}
          onChange={(newLat, newLng, newZoom) => {
            setLat(newLat);
            setLng(newLng);
            setZoom(newZoom);
          }}
          tileUrl={activeStyle.tileUrl}
          tileAttribution={activeStyle.tileAttribution}
        />
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save General Settings'}
      </button>
    </form>
  );
}

// ======================
// Appearance Tab
// ======================

function AppearanceTab({ config, onSave, saving }: TabProps) {
  const [preset, setPreset] = useState(config.theme.preset);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave([
      { key: 'theme', value: { preset } },
    ]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="label">Color Theme</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(THEME_PRESETS).map(([key, theme]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                preset === key
                  ? 'border-forest ring-2 ring-sage-light'
                  : 'border-sage-light hover:border-sage'
              }`}
            >
              <div className="flex gap-1 mb-2">
                {Object.values(theme.colors).slice(0, 4).map((color, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-forest-dark">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save Appearance'}
      </button>
    </form>
  );
}

// ======================
// About Tab
// ======================

function AboutTab({ config, onSave, saving }: TabProps) {
  const [aboutEnabled, setAboutEnabled] = useState(config.aboutPageEnabled);
  const [aboutContent, setAboutContent] = useState(config.aboutContent);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave([
      { key: 'about_page_enabled', value: aboutEnabled },
      { key: 'about_content', value: aboutContent },
    ]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-sage-light/50 rounded-lg">
        <div>
          <h3 className="text-sm font-medium text-forest-dark">About Page Visibility</h3>
          <p className="text-xs text-sage mt-0.5">
            {aboutEnabled
              ? 'The about page is visible to visitors.'
              : 'The about page is hidden. You can still edit content below.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={aboutEnabled}
          onClick={() => setAboutEnabled(!aboutEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            aboutEnabled ? 'bg-forest' : 'bg-gray-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
              aboutEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
      <div>
        <label htmlFor="about" className="label">About Page Content (Markdown)</label>
        <textarea
          id="about"
          value={aboutContent}
          onChange={(e) => setAboutContent(e.target.value)}
          className="input-field min-h-[300px] font-mono text-sm"
          placeholder="# About&#10;&#10;Describe your project here..."
        />
      </div>
      <div>
        <h3 className="text-sm font-medium text-forest-dark mb-2">Preview</h3>
        <div className="card prose prose-sm max-w-none">
          {aboutContent.split('\n').map((line, i) => {
            if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold">{line.replace('# ', '')}</h1>;
            if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-4">{line.replace('## ', '')}</h2>;
            if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-3">{line.replace('### ', '')}</h3>;
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} className="text-sm text-forest-dark/80">{line}</p>;
          })}
        </div>
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save About Page'}
      </button>
    </form>
  );
}

// ======================
// Footer Tab
// ======================

function FooterTab({ config, onSave, saving }: TabProps) {
  const [footerText, setFooterText] = useState(config.footerText);
  const [footerLinks, setFooterLinks] = useState(config.footerLinks);

  function addLink() {
    setFooterLinks([...footerLinks, { label: '', url: '' }]);
  }

  function removeLink(index: number) {
    setFooterLinks(footerLinks.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: 'label' | 'url', value: string) {
    setFooterLinks(footerLinks.map((link, i) =>
      i === index ? { ...link, [field]: value } : link
    ));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLinks = footerLinks.filter((l) => l.label && l.url);
    onSave([
      { key: 'footer_text', value: footerText },
      { key: 'footer_links', value: validLinks },
    ]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="footer-text" className="label">Footer Text</label>
        <input
          id="footer-text"
          type="text"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          className="input-field"
          placeholder="e.g., Built with Field Mapper"
        />
      </div>
      <div>
        <label className="label">Footer Links</label>
        <div className="space-y-3">
          {footerLinks.map((link, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(i, 'label', e.target.value)}
                className="input-field flex-1"
                placeholder="Label"
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => updateLink(i, 'url', e.target.value)}
                className="input-field flex-1"
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="text-red-500 hover:text-red-700 text-sm px-2 py-2.5"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLink}
            className="text-sm text-forest hover:text-forest-dark transition-colors"
          >
            + Add Link
          </button>
        </div>
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Save Footer Settings'}
      </button>
    </form>
  );
}

// ======================
// Shared types
// ======================

interface TabProps {
  config: ReturnType<typeof useConfig>;
  onSave: (entries: { key: string; value: unknown }[]) => Promise<void>;
  saving: boolean;
}
