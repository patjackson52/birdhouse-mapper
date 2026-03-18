import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../defaults';
import { CONFIG_KEY_MAP, type SiteConfig } from '../types';

describe('CONFIG_KEY_MAP', () => {
  it('maps all DB keys to valid SiteConfig properties', () => {
    const siteConfigKeys = Object.keys(DEFAULT_CONFIG) as (keyof SiteConfig)[];

    for (const [dbKey, propName] of Object.entries(CONFIG_KEY_MAP)) {
      expect(siteConfigKeys).toContain(propName);
    }
  });

  it('covers all SiteConfig properties', () => {
    const mappedProps = new Set(Object.values(CONFIG_KEY_MAP));
    const configProps = Object.keys(DEFAULT_CONFIG) as (keyof SiteConfig)[];

    for (const prop of configProps) {
      expect(mappedProps.has(prop)).toBe(true);
    }
  });

  it('has no duplicate property mappings', () => {
    const values = Object.values(CONFIG_KEY_MAP);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has setupComplete set to false', () => {
    expect(DEFAULT_CONFIG.setupComplete).toBe(false);
  });

  it('has all required fields defined', () => {
    expect(DEFAULT_CONFIG.siteName).toBeDefined();
    expect(DEFAULT_CONFIG.tagline).toBeDefined();
    expect(DEFAULT_CONFIG.mapCenter).toBeDefined();
    expect(DEFAULT_CONFIG.theme).toBeDefined();
    expect(DEFAULT_CONFIG.footerLinks).toEqual([]);
    expect(DEFAULT_CONFIG.customNavItems).toEqual([]);
    expect(DEFAULT_CONFIG.customMap).toBeNull();
    expect(DEFAULT_CONFIG.logoUrl).toBeNull();
    expect(DEFAULT_CONFIG.faviconUrl).toBeNull();
  });

  it('has a valid map center with lat, lng, and zoom', () => {
    const { mapCenter } = DEFAULT_CONFIG;
    expect(typeof mapCenter.lat).toBe('number');
    expect(typeof mapCenter.lng).toBe('number');
    expect(typeof mapCenter.zoom).toBe('number');
  });

  it('has a theme with a preset', () => {
    expect(DEFAULT_CONFIG.theme.preset).toBeDefined();
    expect(typeof DEFAULT_CONFIG.theme.preset).toBe('string');
  });
});

describe('config parsing', () => {
  it('correctly builds SiteConfig from DB rows', () => {
    // Simulate what getConfig() does: start with defaults, overlay DB values
    const dbRows = [
      { key: 'site_name', value: 'My Bird Project' },
      { key: 'tagline', value: 'Tracking nests' },
      { key: 'map_center', value: { lat: 47.6, lng: -122.5, zoom: 16 } },
      { key: 'setup_complete', value: true },
    ];

    const config = { ...DEFAULT_CONFIG };
    for (const row of dbRows) {
      const propName = CONFIG_KEY_MAP[row.key];
      if (propName) {
        (config as Record<string, unknown>)[propName] = row.value;
      }
    }

    expect(config.siteName).toBe('My Bird Project');
    expect(config.tagline).toBe('Tracking nests');
    expect(config.mapCenter).toEqual({ lat: 47.6, lng: -122.5, zoom: 16 });
    expect(config.setupComplete).toBe(true);
    // Unset values retain defaults
    expect(config.footerText).toBe('Built with Field Mapper');
    expect(config.theme).toEqual({ preset: 'forest' });
  });

  it('ignores unknown DB keys', () => {
    const dbRows = [
      { key: 'unknown_key', value: 'should be ignored' },
      { key: 'site_name', value: 'Valid' },
    ];

    const config = { ...DEFAULT_CONFIG };
    for (const row of dbRows) {
      const propName = CONFIG_KEY_MAP[row.key];
      if (propName) {
        (config as Record<string, unknown>)[propName] = row.value;
      }
    }

    expect(config.siteName).toBe('Valid');
    expect((config as Record<string, unknown>)['unknown_key']).toBeUndefined();
  });

  it('handles null values from DB', () => {
    const dbRows = [
      { key: 'logo_url', value: null },
      { key: 'custom_map', value: null },
    ];

    const config = { ...DEFAULT_CONFIG };
    for (const row of dbRows) {
      const propName = CONFIG_KEY_MAP[row.key];
      if (propName) {
        (config as Record<string, unknown>)[propName] = row.value;
      }
    }

    expect(config.logoUrl).toBeNull();
    expect(config.customMap).toBeNull();
  });
});
