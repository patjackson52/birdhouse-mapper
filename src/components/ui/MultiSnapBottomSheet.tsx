'use client';

import { useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type SheetState = 'peek' | 'half' | 'full';

interface MultiSnapBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStateChange?: (state: SheetState) => void;
  children: ReactNode;
}

const HANDLE_HEIGHT = 48; // handle bar + padding
const MAX_HEIGHT_RATIO = 0.92;

export default function MultiSnapBottomSheet({
  isOpen,
  onClose,
  onStateChange,
  children,
}: MultiSnapBottomSheetProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight * MAX_HEIGHT_RATIO : 600
  );

  // Measure content natural height
  useEffect(() => {
    if (!isOpen || !measureRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });

    observer.observe(measureRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  // Track viewport height changes (rotation, resize)
  useEffect(() => {
    const handleResize = () => {
      setMaxHeight(window.innerHeight * MAX_HEIGHT_RATIO);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Emit 'full' when sheet opens
  useEffect(() => {
    if (isOpen) {
      onStateChange?.('full');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const sheetHeight = Math.min(contentHeight + HANDLE_HEIGHT, maxHeight);
  const enableScroll = contentHeight + HANDLE_HEIGHT > maxHeight;

  // Swipe-to-dismiss
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - touchStartY.current; // positive = swipe down
    const elapsed = (Date.now() - touchStartTime.current) / 1000;
    const velocity = Math.abs(deltaY) / elapsed;

    // Only dismiss on downward swipe when content is scrolled to top
    if (deltaY > 0) {
      const scrollTop = scrollRef.current?.scrollTop ?? 0;
      if (scrollTop <= 0 && (deltaY > 80 || velocity > 500)) {
        onClose();
      }
    }
  }, [onClose]);

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
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-white shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ height: 0 }}
            animate={{ height: sheetHeight }}
            exit={{ height: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Handle */}
            <div className="flex shrink-0 items-center justify-center pt-3 pb-2">
              <div className="h-1.5 w-12 rounded-full bg-gray-300" />
            </div>

            {/* Content */}
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                className="px-4 pb-4 h-full"
                style={{ overflowY: enableScroll ? 'auto' : 'hidden' }}
              >
                <div ref={measureRef}>
                  {children}
                </div>
              </div>
              {enableScroll && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
