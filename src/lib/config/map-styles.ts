export interface MapStyle {
  name: string;
  category: 'standard' | 'light' | 'dark' | 'outdoor' | 'satellite' | 'artistic';
  tileUrl: string;
  tileAttribution: string;
}

export const MAP_STYLES: Record<string, MapStyle> = {
  // Standard / Street Detail
  osm: {
    name: 'OpenStreetMap',
    category: 'standard',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  'carto-voyager': {
    name: 'CartoDB Voyager',
    category: 'standard',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },

  // Light / Minimal
  'carto-positron': {
    name: 'CartoDB Positron',
    category: 'light',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  'stadia-smooth': {
    name: 'Stadia Smooth',
    category: 'light',
    tileUrl: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  'stadia-smooth-dark': {
    name: 'Stadia Smooth Dark',
    category: 'dark',
    tileUrl: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },

  // Dark
  'carto-dark': {
    name: 'CartoDB Dark Matter',
    category: 'dark',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },

  // Outdoor / Terrain
  'stadia-outdoors': {
    name: 'Stadia Outdoors',
    category: 'outdoor',
    tileUrl: 'https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  'opentopomap': {
    name: 'OpenTopoMap',
    category: 'outdoor',
    tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },

  // Satellite
  'esri-imagery': {
    name: 'ESRI Satellite',
    category: 'satellite',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileAttribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },

  // Artistic
  'stadia-watercolor': {
    name: 'Watercolor',
    category: 'artistic',
    tileUrl: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
    tileAttribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

/** Default map style per theme preset */
export const THEME_DEFAULT_MAP_STYLE: Record<string, string> = {
  forest: 'carto-voyager',
  ocean: 'carto-positron',
  desert: 'stadia-outdoors',
  urban: 'carto-dark',
  arctic: 'stadia-smooth',
  meadow: 'osm',
};

/** Category labels for grouping in UI */
export const MAP_STYLE_CATEGORIES: Record<string, string> = {
  standard: 'Standard',
  light: 'Light & Minimal',
  dark: 'Dark',
  outdoor: 'Outdoor & Terrain',
  satellite: 'Satellite',
  artistic: 'Artistic',
};
