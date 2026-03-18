'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from './types';
import type { ResolvedTheme } from './themes';
import { DEFAULT_CONFIG } from './defaults';

interface ConfigContextValue {
  config: SiteConfig;
  theme: ResolvedTheme;
}

const defaultTheme: ResolvedTheme = {
  colors: {
    primary: '#5D7F3A',
    'primary-dark': '#2C3E2D',
    accent: '#D4A853',
    background: '#FAFAF7',
    'surface-light': '#EEF2EA',
    muted: '#7F8C7A',
  },
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_CONFIG,
  theme: defaultTheme,
});

interface ConfigProviderProps {
  config: SiteConfig;
  theme: ResolvedTheme;
  children: ReactNode;
}

export function ConfigProvider({ config, theme, children }: ConfigProviderProps) {
  return (
    <ConfigContext.Provider value={{ config, theme }}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Access site configuration from any client component.
 */
export function useConfig(): SiteConfig {
  return useContext(ConfigContext).config;
}

/**
 * Access resolved theme (colors + tile URL) from any client component.
 */
export function useTheme(): ResolvedTheme {
  return useContext(ConfigContext).theme;
}
