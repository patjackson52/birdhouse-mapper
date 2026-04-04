'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type SheetState = 'peek' | 'half' | 'full';

interface MultiSnapBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStateChange: (state: SheetState) => void;
  initialState?: SheetState;
  children: ReactNode;
}

const SNAP_PERCENTAGES: Record<SheetState, number> = {
  peek: 25,
  half: 50,
  full: 92,
};

const SNAP_ORDER: SheetState[] = ['peek', 'half', 'full'];

function getHeightForState(state: SheetState): string {
  return `${SNAP_PERCENTAGES[state]}vh`;
}

function getOverlayOpacity(state: SheetState): number {
  if (state === 'peek') return 0.15;
  if (state === 'half') return 0.4;
  return 0.6;
}

function findNearestSnap(heightVh: number): SheetState {
  let nearest: SheetState = 'peek';
  let minDist = Infinity;
  for (const state of SNAP_ORDER) {
    const dist = Math.abs(SNAP_PERCENTAGES[state] - heightVh);
    if (dist < minDist) {
      minDist = dist;
      nearest = state;
    }
  }
  return nearest;
}

export default function MultiSnapBottomSheet({
  isOpen,
  onClose,
  onStateChange,
  initialState = 'peek',
  children,
}: MultiSnapBottomSheetProps) {
  // Use a ref to hold mutable state values needed in touch handlers without
  // causing re-renders mid-gesture.
  const stateRef = useRef<SheetState>(initialState);
  // We track the "committed" state in a separate ref so we can read it in
  // touch handlers without needing it in deps arrays.
  const currentStateRef = useRef<SheetState>(initialState);

  // Keep currentStateRef up-to-date when the sheet opens/resets.
  useEffect(() => {
    if (isOpen) {
      currentStateRef.current = initialState;
      stateRef.current = initialState;
    }
  }, [isOpen, initialState]);

  // Body overflow lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Touch tracking refs — not state so we don't re-render during a drag.
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - endY; // positive = swipe up
    const elapsed = (Date.now() - touchStartTime.current) / 1000; // seconds
    const velocity = Math.abs(deltaY) / elapsed; // px/s

    const currentIndex = SNAP_ORDER.indexOf(currentStateRef.current);

    if (deltaY > 0) {
      // Swiping up — go to next snap(s)
      if (velocity > 500 && currentIndex < SNAP_ORDER.length - 2) {
        // Fast swipe: skip one snap point
        const newState = SNAP_ORDER[currentIndex + 2];
        currentStateRef.current = newState;
        onStateChange(newState);
      } else if (currentIndex < SNAP_ORDER.length - 1) {
        const newState = SNAP_ORDER[currentIndex + 1];
        currentStateRef.current = newState;
        onStateChange(newState);
      }
    } else {
      // Swiping down
      const viewportHeight = window.innerHeight;
      const deltaVh = (Math.abs(deltaY) / viewportHeight) * 100;
      const currentHeightVh = SNAP_PERCENTAGES[currentStateRef.current];
      const projectedVh = currentHeightVh - deltaVh;

      if (projectedVh < 15) {
        // Below dismiss threshold
        onClose();
        return;
      }

      if (velocity > 500 && currentIndex > 1) {
        // Fast swipe down: skip one snap point
        const newState = SNAP_ORDER[currentIndex - 2];
        currentStateRef.current = newState;
        onStateChange(newState);
      } else if (currentIndex > 0) {
        const newState = SNAP_ORDER[currentIndex - 1];
        currentStateRef.current = newState;
        onStateChange(newState);
      } else {
        // Already at peek, check if should dismiss
        if (Math.abs(deltaY) > 80) {
          onClose();
        }
      }
    }
  };

  const handleHandleClick = () => {
    const current = currentStateRef.current;
    const newState: SheetState = current === 'peek' ? 'half' : 'peek';
    currentStateRef.current = newState;
    onStateChange(newState);
  };

  // We read the committed state to drive the animation height. Because touch
  // handlers update currentStateRef and call onStateChange, the parent will
  // re-render us with new props if it manages state externally — but we also
  // keep our own internal ref for self-contained snap logic.
  // For animation we derive the height from whatever initialState the parent
  // last passed (they should mirror onStateChange back as initialState).
  const animatedState = isOpen ? initialState : 'peek';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            data-testid="sheet-overlay"
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'black' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: getOverlayOpacity(animatedState) }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ height: '0vh' }}
            animate={{ height: getHeightForState(animatedState) }}
            exit={{ height: '0vh' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Handle */}
            <div className="flex shrink-0 items-center justify-center pt-3 pb-2">
              <button
                aria-label="Expand or collapse sheet"
                className="h-1.5 w-12 rounded-full bg-gray-300"
                onClick={handleHandleClick}
              />
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
