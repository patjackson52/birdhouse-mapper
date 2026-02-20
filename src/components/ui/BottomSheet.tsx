'use client';

import { useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [startY, setStartY] = useState(0);
  const [currentTranslate, setCurrentTranslate] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 0) {
      setCurrentTranslate(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (currentTranslate > 100) {
      onClose();
    }
    setCurrentTranslate(0);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="bottom-sheet-overlay animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="bottom-sheet animate-slide-up"
        style={{
          transform: `translateY(${currentTranslate}px)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="bottom-sheet-handle" />
        <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: 'calc(85vh - 24px)' }}>
          {children}
        </div>
      </div>
    </>
  );
}
