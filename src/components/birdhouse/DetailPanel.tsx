'use client';

import type { BirdhouseWithDetails } from '@/lib/types';
import StatusBadge from './StatusBadge';
import UpdateTimeline from './UpdateTimeline';
import BottomSheet from '@/components/ui/BottomSheet';
import { formatDate } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface DetailPanelProps {
  birdhouse: BirdhouseWithDetails | null;
  onClose: () => void;
}

export default function DetailPanel({ birdhouse, onClose }: DetailPanelProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!birdhouse) return null;

  const content = (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-semibold text-forest-dark text-xl mb-1">
            {birdhouse.name}
          </h2>
          <StatusBadge status={birdhouse.status} />
        </div>
        {!isMobile && (
          <button
            onClick={onClose}
            className="ml-2 p-1 rounded-lg text-sage hover:bg-sage-light transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {birdhouse.species_target && (
        <div className="mb-3">
          <span className="text-xs font-medium text-sage uppercase tracking-wide">
            Target Species
          </span>
          <p className="text-sm text-forest-dark font-medium">
            {birdhouse.species_target}
          </p>
        </div>
      )}

      {birdhouse.installed_date && (
        <div className="mb-3">
          <span className="text-xs font-medium text-sage uppercase tracking-wide">
            Installed
          </span>
          <p className="text-sm text-forest-dark">
            {formatDate(birdhouse.installed_date)}
          </p>
        </div>
      )}

      {birdhouse.description && (
        <div className="mb-4">
          <span className="text-xs font-medium text-sage uppercase tracking-wide">
            Description
          </span>
          <p className="text-sm text-forest-dark/80 leading-relaxed mt-0.5">
            {birdhouse.description}
          </p>
        </div>
      )}

      {/* Primary photo */}
      {birdhouse.photos.length > 0 && (
        <div className="mb-4">
          <div className="aspect-video bg-sage-light rounded-lg overflow-hidden">
            <div className="w-full h-full flex items-center justify-center text-sage text-sm">
              Photo placeholder
            </div>
          </div>
        </div>
      )}

      {/* Updates timeline */}
      <div>
        <h3 className="text-xs font-medium text-sage uppercase tracking-wide mb-3">
          Updates
        </h3>
        <UpdateTimeline updates={birdhouse.updates} />
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <BottomSheet isOpen={!!birdhouse} onClose={onClose}>
        {content}
      </BottomSheet>
    );
  }

  // Desktop: side panel
  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-sage-light z-20 overflow-y-auto animate-slide-in-right">
      <div className="p-5">{content}</div>
    </div>
  );
}
