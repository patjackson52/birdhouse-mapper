'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { extractExternalLinks, type LinkSuggestion } from './link-suggestions';

interface SuggestionsContextValue {
  externalLinks: LinkSuggestion[];
}

const SuggestionsContext = createContext<SuggestionsContextValue>({
  externalLinks: [],
});

interface PuckSuggestionsProviderProps {
  data: any;
  children: ReactNode;
}

export function PuckSuggestionsProvider({ data, children }: PuckSuggestionsProviderProps) {
  const externalLinks = useMemo(() => extractExternalLinks(data), [data]);
  const value = useMemo(() => ({ externalLinks }), [externalLinks]);

  return (
    <SuggestionsContext.Provider value={value}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useLinkSuggestions(): SuggestionsContextValue {
  return useContext(SuggestionsContext);
}
