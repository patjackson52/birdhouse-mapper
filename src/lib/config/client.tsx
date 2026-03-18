'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteConfig } from './types';
import { DEFAULT_CONFIG } from './defaults';

const ConfigContext = createContext<SiteConfig>(DEFAULT_CONFIG);

interface ConfigProviderProps {
  config: SiteConfig;
  children: ReactNode;
}

export function ConfigProvider({ config, children }: ConfigProviderProps) {
  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Access site configuration from any client component.
 * Must be used within a ConfigProvider (which wraps the app in layout.tsx).
 */
export function useConfig(): SiteConfig {
  return useContext(ConfigContext);
}
