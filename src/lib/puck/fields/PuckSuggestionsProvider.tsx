'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { extractExternalLinks, type LinkSuggestion } from './link-suggestions';

interface SuggestionsContextValue {
  externalLinks: LinkSuggestion[];
  pageLinks: LinkSuggestion[];
}

const SuggestionsContext = createContext<SuggestionsContextValue>({
  externalLinks: [],
  pageLinks: [],
});

interface PuckSuggestionsProviderProps {
  data: any;
  pageLinks?: LinkSuggestion[];
  children: ReactNode;
}

export function PuckSuggestionsProvider({ data, pageLinks = [], children }: PuckSuggestionsProviderProps) {
  const externalLinks = useMemo(() => extractExternalLinks(data), [data]);
  const value = useMemo(() => ({ externalLinks, pageLinks }), [externalLinks, pageLinks]);

  return (
    <SuggestionsContext.Provider value={value}>
      {children}
    </SuggestionsContext.Provider>
  );
}

export function useLinkSuggestions(): SuggestionsContextValue {
  return useContext(SuggestionsContext);
}
