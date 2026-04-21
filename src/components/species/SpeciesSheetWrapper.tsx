'use client';

import type { ReactNode } from 'react';
import '@/components/item/timeline/timeline.css';

export function SpeciesSheetWrapper({ children }: { children: ReactNode }) {
  return (
    <div
      className="fm-slide-in fixed inset-0 z-[110] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}
