import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../defaults';
import { buildSiteConfig, type SiteConfig } from '../types';

describe('buildSiteConfig', () => {
  it('maps org and property fields to SiteConfig shape', () => {
    const org = {
      name: 'My Bird Project',
      tagline: 'Tracking nests',
      logo_url: 'https://example.com/logo.png',
      favicon_url: 'https://example.com/favicon.ico',
      theme: { preset: 'ocean' },
      setup_complete: true,
    };
    const property = {
      name: 'Eagle River Property',
      description: 'Bainbridge Island',
      map_default_lat: 47.6,
      map_default_lng: -122.5,
      map_default_zoom: 16,
      map_style: 'satellite',
      custom_map: null,
      about_content: '# About us',
      about_page_enabled: true,
      footer_text: 'Footer here',
      footer_links: [{ label: 'Home', url: '/' }],
      custom_nav_items: [{ label: 'Blog', href: '/blog' }],
      landing_page: null,
      logo_url: null,
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
    };

    const config = buildSiteConfig(org, property);

    expect(config.siteName).toBe('Eagle River Property');
    expect(config.tagline).toBe('Tracking nests');
    expect(config.locationName).toBe('Bainbridge Island');
    expect(config.mapCenter).toEqual({ lat: 47.6, lng: -122.5, zoom: 16 });
    expect(config.theme).toEqual({ preset: 'ocean' });
    expect(config.logoUrl).toBe('https://example.com/logo.png');
    expect(config.faviconUrl).toBe('https://example.com/favicon.ico');
    expect(config.aboutContent).toBe('# About us');
    expect(config.footerText).toBe('Footer here');
    expect(config.footerLinks).toEqual([{ label: 'Home', url: '/' }]);
    expect(config.customNavItems).toEqual([{ label: 'Blog', href: '/blog' }]);
    expect(config.mapStyle).toBe('satellite');
    expect(config.customMap).toBeNull();
    expect(config.setupComplete).toBe(true);
    expect(config.landingPage).toBeNull();
  });

  it('uses property logo_url over org logo_url when present', () => {
    const org = {
      name: 'Test',
      tagline: null,
      logo_url: 'https://example.com/org-logo.png',
      favicon_url: null,
      theme: null,
      setup_complete: false,
    };
    const property = {
      description: null,
      map_default_lat: null,
      map_default_lng: null,
      map_default_zoom: null,
      map_style: null,
      custom_map: null,
      about_content: null,
      about_page_enabled: null,
      footer_text: null,
      footer_links: null,
      custom_nav_items: null,
      landing_page: null,
      logo_url: 'https://example.com/prop-logo.png',
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
    };

    const config = buildSiteConfig(org, property);
    expect(config.logoUrl).toBe('https://example.com/prop-logo.png');
  });

  it('falls back to org logo_url when property logo_url is null', () => {
    const org = {
      name: 'Test',
      tagline: null,
      logo_url: 'https://example.com/org-logo.png',
      favicon_url: null,
      theme: null,
      setup_complete: false,
    };
    const property = {
      description: null,
      map_default_lat: null,
      map_default_lng: null,
      map_default_zoom: null,
      map_style: null,
      custom_map: null,
      about_content: null,
      about_page_enabled: null,
      footer_text: null,
      footer_links: null,
      custom_nav_items: null,
      landing_page: null,
      logo_url: null,
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
    };

    const config = buildSiteConfig(org, property);
    expect(config.logoUrl).toBe('https://example.com/org-logo.png');
  });

  it('resolves mapDisplayConfig from org and property', () => {
    const org = {
      name: 'Test',
      tagline: null,
      logo_url: null,
      favicon_url: null,
      theme: null,
      setup_complete: false,
      map_display_config: { controls: { legend: false, quickAdd: false } },
    };
    const property = {
      description: null,
      map_default_lat: null,
      map_default_lng: null,
      map_default_zoom: null,
      map_style: null,
      custom_map: null,
      about_content: null,
      about_page_enabled: null,
      footer_text: null,
      footer_links: null,
      custom_nav_items: null,
      landing_page: null,
      logo_url: null,
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
      map_display_config: { controls: { legend: true } },
    };

    const config = buildSiteConfig(org, property);

    expect(config.mapDisplayConfig.controls.legend).toBe(true);
    expect(config.mapDisplayConfig.controls.quickAdd).toBe(false);
    expect(config.mapDisplayConfig.controls.locateMe).toBe(true);
  });

  it('uses defaults for null org/property fields', () => {
    const org = {
      name: 'Minimal',
      tagline: null,
      logo_url: null,
      favicon_url: null,
      theme: null,
      setup_complete: false,
    };
    const property = {
      description: null,
      map_default_lat: null,
      map_default_lng: null,
      map_default_zoom: null,
      map_style: null,
      custom_map: null,
      about_content: null,
      about_page_enabled: null,
      footer_text: null,
      footer_links: null,
      custom_nav_items: null,
      landing_page: null,
      logo_url: null,
      puck_pages: null,
      puck_root: null,
      puck_template: null,
      puck_pages_draft: null,
      puck_root_draft: null,
      puck_page_meta: null,
    };

    const config = buildSiteConfig(org, property);

    expect(config.siteName).toBe('Minimal');
    expect(config.tagline).toBe('');
    expect(config.locationName).toBe('');
    expect(config.mapCenter).toEqual({ lat: 0, lng: 0, zoom: 2 });
    expect(config.theme).toEqual({ preset: 'forest' });
    expect(config.aboutContent).toBe('');
    expect(config.logoUrl).toBeNull();
    expect(config.faviconUrl).toBeNull();
    expect(config.footerText).toBe('');
    expect(config.footerLinks).toEqual([]);
    expect(config.customNavItems).toEqual([]);
    expect(config.setupComplete).toBe(false);
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
