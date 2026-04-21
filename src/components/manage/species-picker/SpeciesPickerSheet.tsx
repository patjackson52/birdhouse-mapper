'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { SpeciesDetail, SpeciesResult } from '@/lib/types';
import { useNetworkStatus } from '@/lib/offline/network';
import { useUserLocation } from '@/lib/location/provider';
import {
  initStaged,
  toggleStaged,
  planCommit,
  type SelectedEntitySeed,
  type StagedState,
} from './staged-selection';
import SpeciesPickerGrid from './SpeciesPickerGrid';
import SpeciesPickerDetail from './SpeciesPickerDetail';
import type { RecentSpeciesEntry } from './useRecentSpecies';
import '@/components/item/timeline/timeline.css';

interface SpeciesPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  entityTypeId: string;
  entityTypeName: string;
  lat?: number;
  lng?: number;
  seeds: SelectedEntitySeed[];
  onCommit: (plan: {
    newTaxa: SpeciesResult[];
    keptEntityIds: string[];
  }) => Promise<void>;
}

export default function SpeciesPickerSheet({
  isOpen,
  onClose,
  orgId,
  entityTypeId,
  entityTypeName,
  lat,
  lng,
  seeds,
  onCommit,
}: SpeciesPickerSheetProps): ReactElement {
  const { isOnline } = useNetworkStatus();
  const userLocation = useUserLocation();

  // Resolve coords: user's device position (if map already started tracking) takes priority
  // over the property/update coords passed in. The picker never calls startTracking().
  const resolvedLat = userLocation.position?.lat ?? lat;
  const resolvedLng = userLocation.position?.lng ?? lng;

  const [state, setState] = useState<StagedState>(() => initStaged(seeds));
  const [detailCard, setDetailCard] = useState<SpeciesResult | null>(null);
  const detailCacheRef = useRef<Map<number, SpeciesDetail>>(new Map());
  const [committing, setCommitting] = useState(false);

  // Reseed whenever the sheet transitions from closed to open.
  useEffect(() => {
    if (isOpen) {
      setState(initStaged(seeds));
      setDetailCard(null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body overflow lock while sheet is open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const isStaged = useCallback(
    (taxonId: number) => state.staged.has(taxonId),
    [state]
  );

  const handleOpenDetail = useCallback((card: SpeciesResult) => {
    setDetailCard(card);
  }, []);

  const handleBack = useCallback(() => {
    setDetailCard(null);
  }, []);

  const handleToggle = useCallback(
    (card: SpeciesResult) => {
      setState((prev) => toggleStaged(prev, card.id, card));
    },
    []
  );

  const handleDone = useCallback(async () => {
    setCommitting(true);
    try {
      const plan = planCommit(state);
      await onCommit(plan);
      onClose();
    } finally {
      setCommitting(false);
    }
  }, [state, onCommit, onClose]);

  const handleRecentLoaded = useCallback((_entries: RecentSpeciesEntry[]) => {
    // Reserved for future reconciliation — no-op for now.
  }, []);

  const header = useMemo(
    () => (
      <div className="flex shrink-0 items-center justify-between border-b border-forest-border-soft bg-white px-4 pb-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close species picker"
          className="text-lg text-sage hover:text-red-600"
        >
          &times;
        </button>
        <h2 className="font-heading text-base text-forest-dark">
          {detailCard ? 'Species detail' : `Choose ${entityTypeName.toLowerCase()}`}
        </h2>
        <button
          type="button"
          onClick={handleDone}
          disabled={committing}
          className="text-sm font-semibold text-[var(--color-primary)] disabled:opacity-50"
        >
          Done
        </button>
      </div>
    ),
    [onClose, detailCard, entityTypeName, handleDone, committing]
  );

  if (!isOpen) return <></>;

  return (
    <div
      className="fm-slide-up fixed inset-0 z-[80] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Species picker"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {header}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {detailCard ? (
          <SpeciesPickerDetail
            card={detailCard}
            detailCache={detailCacheRef.current}
            lat={resolvedLat}
            lng={resolvedLng}
            isOnline={isOnline}
            isStaged={isStaged(detailCard.id)}
            onBack={handleBack}
            onToggle={() => handleToggle(detailCard)}
          />
        ) : (
          <SpeciesPickerGrid
            orgId={orgId}
            entityTypeId={entityTypeId}
            lat={resolvedLat}
            lng={resolvedLng}
            isOnline={isOnline}
            isStaged={isStaged}
            onOpenDetail={handleOpenDetail}
            onRecentLoaded={handleRecentLoaded}
          />
        )}
      </div>
    </div>
  );
}
