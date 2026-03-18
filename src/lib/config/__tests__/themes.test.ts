import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, resolveTheme, themeToCssVars } from '../themes';
import { MAP_STYLES, THEME_DEFAULT_MAP_STYLE } from '../map-styles';

describe('THEME_PRESETS', () => {
  it('has 6 preset themes', () => {
    expect(Object.keys(THEME_PRESETS)).toHaveLength(6);
  });

  it('includes forest, ocean, desert, urban, arctic, meadow', () => {
    const names = Object.keys(THEME_PRESETS);
    expect(names).toContain('forest');
    expect(names).toContain('ocean');
    expect(names).toContain('desert');
    expect(names).toContain('urban');
    expect(names).toContain('arctic');
    expect(names).toContain('meadow');
  });

  it('each preset has all required color keys', () => {
    const requiredKeys = ['primary', 'primary-dark', 'accent', 'background', 'surface-light', 'muted'];
    for (const [name, preset] of Object.entries(THEME_PRESETS)) {
      for (const key of requiredKeys) {
        expect(preset.colors).toHaveProperty(key);
        expect(typeof (preset.colors as unknown as Record<string, string>)[key]).toBe('string');
      }
    }
  });

  it('each preset has a tile URL and attribution', () => {
    for (const [name, preset] of Object.entries(THEME_PRESETS)) {
      expect(preset.tileUrl).toBeDefined();
      expect(preset.tileUrl).toContain('{z}');
      expect(preset.tileAttribution).toBeDefined();
      expect(preset.tileAttribution.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveTheme', () => {
  it('returns forest theme colors for preset "forest"', () => {
    const theme = resolveTheme({ preset: 'forest' });
    expect(theme.colors.primary).toBe('#5D7F3A');
    expect(theme.colors['primary-dark']).toBe('#2C3E2D');
  });

  it('falls back to forest for unknown preset', () => {
    const theme = resolveTheme({ preset: 'nonexistent' });
    expect(theme.colors.primary).toBe('#5D7F3A');
  });

  it('applies color overrides', () => {
    const theme = resolveTheme({
      preset: 'forest',
      overrides: { primary: '#FF0000', accent: '#00FF00' },
    });
    expect(theme.colors.primary).toBe('#FF0000');
    expect(theme.colors.accent).toBe('#00FF00');
    // Non-overridden colors stay the same
    expect(theme.colors['primary-dark']).toBe('#2C3E2D');
  });

  it('ignores invalid override keys', () => {
    const theme = resolveTheme({
      preset: 'forest',
      overrides: { 'invalid-key': '#FF0000' },
    });
    expect(theme.colors.primary).toBe('#5D7F3A');
  });

  it('uses the theme default map style tile URL', () => {
    const theme = resolveTheme({ preset: 'ocean' });
    const expectedStyleId = THEME_DEFAULT_MAP_STYLE['ocean'];
    expect(theme.tileUrl).toBe(MAP_STYLES[expectedStyleId].tileUrl);
  });

  it('uses explicit map style when provided', () => {
    const theme = resolveTheme({ preset: 'forest' }, 'esri-imagery');
    expect(theme.tileUrl).toBe(MAP_STYLES['esri-imagery'].tileUrl);
  });

  it('falls back to theme default when map style is null', () => {
    const theme = resolveTheme({ preset: 'forest' }, null);
    const expectedStyleId = THEME_DEFAULT_MAP_STYLE['forest'];
    expect(theme.tileUrl).toBe(MAP_STYLES[expectedStyleId].tileUrl);
  });
});

describe('themeToCssVars', () => {
  it('generates CSS variable declarations', () => {
    const theme = resolveTheme({ preset: 'forest' });
    const css = themeToCssVars(theme);

    expect(css).toContain('--color-primary: #5D7F3A');
    expect(css).toContain('--color-primary-dark: #2C3E2D');
    expect(css).toContain('--color-accent: #D4A853');
    expect(css).toContain('--color-background: #FAFAF7');
    expect(css).toContain('--color-surface-light: #EEF2EA');
    expect(css).toContain('--color-muted: #7F8C7A');
  });

  it('reflects overrides in CSS output', () => {
    const theme = resolveTheme({ preset: 'forest', overrides: { primary: '#FF0000' } });
    const css = themeToCssVars(theme);
    expect(css).toContain('--color-primary: #FF0000');
  });
});
