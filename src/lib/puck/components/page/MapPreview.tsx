'use client';

import Link from 'next/link';
import type { MapPreviewProps } from '../../types';

export function MapPreview({ height, zoom, showControls }: MapPreviewProps) {
  return (
    <Link href="/map" className="group block mx-auto max-w-4xl px-4 py-4">
      <div
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-[var(--color-surface-light)] transition group-hover:shadow-lg"
        style={{ height: `${height}px` }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl">🗺️</div>
            <p className="mt-2 text-sm font-medium text-[var(--color-primary)]">Click to explore the interactive map</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
