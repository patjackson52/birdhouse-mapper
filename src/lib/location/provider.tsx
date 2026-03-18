'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface UserLocationState {
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  heading: number | null;
  error: string | null;
  isTracking: boolean;
  startTracking: () => void;
}

const LocationContext = createContext<UserLocationState>({
  position: null,
  accuracy: null,
  heading: null,
  error: null,
  isTracking: false,
  startTracking: () => {},
});

const THROTTLE_MS = 2000;

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const startWatching = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setError('unavailable');
      return;
    }

    // Clear any existing watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setIsTracking(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;
        lastUpdateRef.current = now;

        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setHeading(pos.coords.heading);
        setError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('denied');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('unavailable');
        } else {
          setError(err.message);
        }
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
  }, []);

  const startTracking = useCallback(() => {
    startWatching();
  }, [startWatching]);

  // Start watching on mount
  useEffect(() => {
    startWatching();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startWatching]);

  return (
    <LocationContext.Provider
      value={{ position, accuracy, heading, error, isTracking, startTracking }}
    >
      {children}
    </LocationContext.Provider>
  );
}

/**
 * Access user location from any client component.
 */
export function useUserLocation(): UserLocationState {
  return useContext(LocationContext);
}
