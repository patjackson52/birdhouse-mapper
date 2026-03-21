'use client';

import { useState, useRef } from 'react';
import type { Photo } from '@/lib/types';
import { getPhotoUrl } from '@/lib/photos';

interface PhotoViewerProps {
  photos: Photo[];
}

export default function PhotoViewer({ photos }: PhotoViewerProps) {
  const sorted = [...photos].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  if (sorted.length === 0) return null;

  const current = sorted[currentIndex];
  const hasMultiple = sorted.length > 1;

  function goPrev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
    setImgError(false);
  }

  function goNext() {
    setCurrentIndex((i) => Math.min(sorted.length - 1, i + 1));
    setImgError(false);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) goNext();
      else goPrev();
    }
  }

  return (
    <div>
      <div
        className="relative aspect-video bg-sage-light rounded-lg overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center text-sage text-sm">
            Photo unavailable
          </div>
        ) : (
          <img
            src={getPhotoUrl(current.storage_path)}
            alt={current.caption || 'Item photo'}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}

        {hasMultiple && currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
            aria-label="Previous photo"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {hasMultiple && currentIndex < sorted.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
            aria-label="Next photo"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {hasMultiple && (
          <span className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {currentIndex + 1} / {sorted.length}
          </span>
        )}
      </div>

      {hasMultiple && (
        <div className="flex justify-center gap-1.5 mt-2">
          {sorted.map((_, i) => (
            <button
              key={sorted[i].id}
              onClick={() => { setCurrentIndex(i); setImgError(false); }}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? 'bg-forest' : 'bg-sage-light'
              }`}
              aria-label={`Go to photo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
