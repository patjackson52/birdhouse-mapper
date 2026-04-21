import type { ReactNode } from 'react';

export function SpeciesFullPageWrapper({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-parchment">{children}</div>;
}
