'use client';

import { useState } from 'react';
import { useUserLocation } from '@/lib/location/provider';

interface LocateButtonProps {
  onLocate: () => void;
}

export default function LocateButton({ onLocate }: LocateButtonProps) {
  const { position, error, isTracking, startTracking } = useUserLocation();
  const [showToast, setShowToast] = useState(false);

  if (error === 'unavailable') return null;

  const isDenied = error === 'denied' && !isTracking;

  function handleClick() {
    if (position) {
      onLocate();
    } else if (isDenied) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      startTracking();
    } else {
      startTracking();
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="absolute bottom-20 md:bottom-6 right-4 z-10 bg-white rounded-lg shadow-lg border border-sage-light p-2.5 text-forest-dark hover:bg-sage-light transition-colors"
        aria-label="Locate me"
        title={isDenied ? 'Location denied' : 'Go to my location'}
      >
        {isDenied ? (
          <svg className="w-5 h-5 text-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
          </svg>
        )}
      </button>

      {showToast && (
        <div className="absolute bottom-32 md:bottom-16 right-4 z-20 bg-forest-dark text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px] animate-fade-in">
          Location access was denied. Enable it in your browser settings.
        </div>
      )}
    </>
  );
}
