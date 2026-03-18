import { MAP_STYLES, THEME_DEFAULT_MAP_STYLE } from './map-styles';

export interface ThemeColors {
  primary: string;
  'primary-dark': string;
  accent: string;
  background: string;
  'surface-light': string;
  muted: string;
}

export interface ThemePreset {
  name: string;
  colors: ThemeColors;
  tileUrl: string;
  tileAttribution: string;
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  forest: {
    name: 'Forest',
    colors: {
      primary: '#5D7F3A',
      'primary-dark': '#2C3E2D',
      accent: '#D4A853',
      background: '#FAFAF7',
      'surface-light': '#EEF2EA',
      muted: '#7F8C7A',
    },
    tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  ocean: {
    name: 'Ocean',
    colors: {
      primary: '#2B6CB0',
      'primary-dark': '#1A365D',
      accent: '#ECC94B',
      background: '#F7FAFC',
      'surface-light': '#EBF4FF',
      muted: '#718096',
    },
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  desert: {
    name: 'Desert',
    colors: {
      primary: '#C05621',
      'primary-dark': '#7B341E',
      accent: '#D69E2E',
      background: '#FFFAF0',
      'surface-light': '#FFF5EB',
      muted: '#A0816C',
    },
    tileUrl: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  urban: {
    name: 'Urban',
    colors: {
      primary: '#4A5568',
      'primary-dark': '#1A202C',
      accent: '#ED8936',
      background: '#F7FAFC',
      'surface-light': '#EDF2F7',
      muted: '#A0AEC0',
    },
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  arctic: {
    name: 'Arctic',
    colors: {
      primary: '#3182CE',
      'primary-dark': '#2A4365',
      accent: '#90CDF4',
      background: '#EBF8FF',
      'surface-light': '#E2F0FB',
      muted: '#718096',
    },
    tileUrl: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  meadow: {
    name: 'Meadow',
    colors: {
      primary: '#68D391',
      'primary-dark': '#276749',
      accent: '#F6E05E',
      background: '#F0FFF4',
      'surface-light': '#E6FFED',
      muted: '#68856E',
    },
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

export interface ResolvedTheme {
  colors: ThemeColors;
  tileUrl: string;
  tileAttribution: string;
}

/**
 * Resolves a theme config (preset name + optional overrides) to final colors and tile URL.
 * If mapStyle is provided, it overrides the theme's default tile source.
 */
export function resolveTheme(
  themeConfig: { preset: string; overrides?: Record<string, string> },
  mapStyleId?: string | null
): ResolvedTheme {

  const preset = THEME_PRESETS[themeConfig.preset] || THEME_PRESETS.forest;
  const colors = { ...preset.colors };

  // Apply overrides
  if (themeConfig.overrides) {
    for (const [key, value] of Object.entries(themeConfig.overrides)) {
      if (key in colors) {
        (colors as Record<string, string>)[key] = value;
      }
    }
  }

  // Resolve map style: explicit setting > theme default > fallback
  const styleId = mapStyleId
    || THEME_DEFAULT_MAP_STYLE[themeConfig.preset]
    || 'osm';
  const mapStyle = MAP_STYLES[styleId] || MAP_STYLES['osm'];

  return {
    colors,
    tileUrl: mapStyle.tileUrl,
    tileAttribution: mapStyle.tileAttribution,
  };
}

/**
 * Generates CSS custom property declarations from resolved theme colors.
 * Returns a string suitable for a style attribute on <html>.
 */
export function themeToCssVars(theme: ResolvedTheme): string {
  return Object.entries(theme.colors)
    .map(([key, value]) => `--color-${key}: ${value}`)
    .join('; ');
}
