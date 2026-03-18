'use client';

import { useState } from 'react';
import { useConfig } from '@/lib/config/client';
import { useRouter } from 'next/navigation';
import { saveConfig, saveConfigValue } from './actions';
import { THEME_PRESETS } from '@/lib/config/themes';

type SettingsTab = 'general' | 'appearance' | 'about' | 'footer';

export default function SettingsPage() {
  const config = useConfig();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
        <AppearanceTab config={config} onSave={handleSave} saving={saving} />
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
  const [locationName, setLocationName] = useState(config.locationName);
  const [lat, setLat] = useState(String(config.mapCenter.lat));
  const [lng, setLng] = useState(String(config.mapCenter.lng));
  const [zoom, setZoom] = useState(String(config.mapCenter.zoom));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave([
      { key: 'site_name', value: siteName },
      { key: 'tagline', value: tagline },
      { key: 'location_name', value: locationName },
      { key: 'map_center', value: { lat: Number(lat), lng: Number(lng), zoom: Number(zoom) } },
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
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="lat" className="label">Latitude</label>
          <input
            id="lat"
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="lng" className="label">Longitude</label>
          <input
            id="lng"
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="zoom" className="label">Zoom Level</label>
          <input
            id="zoom"
            type="number"
            min="1"
            max="20"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
            className="input-field"
          />
        </div>
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
        <label className="label">Theme Preset</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(THEME_PRESETS).map(([key, theme]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                preset === key
                  ? 'border-forest ring-2 ring-forest/20'
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
  const [aboutContent, setAboutContent] = useState(config.aboutContent);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave([{ key: 'about_content', value: aboutContent }]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
