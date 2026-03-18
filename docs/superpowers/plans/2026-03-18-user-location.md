# User Location Feature — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add continuous GPS tracking with a blue dot on the map, distance display in list/detail views, and smart item pre-selection in forms.

**Architecture:** A `UserLocationProvider` React context manages GPS state app-wide via `watchPosition()`. A `UserLocationLayer` Leaflet component renders the blue dot and accuracy ring. Pure utility functions handle distance calculations. Existing components consume location via hooks.

**Tech Stack:** React context, Geolocation API (`watchPosition`), Leaflet (`L.circleMarker`, `L.circle`, `useMap`), Haversine formula

**Spec:** `docs/superpowers/specs/2026-03-18-user-location-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/location/utils.ts` | Pure functions: `distanceBetween`, `formatDistance`, `getDistanceToItem` |
| `src/lib/location/provider.tsx` | `UserLocationProvider` context, `useUserLocation` hook |
| `src/components/map/UserLocationLayer.tsx` | Blue dot, accuracy ring, smart centering (Leaflet component) |
| `src/components/map/LocateButton.tsx` | "Locate Me" button |
| `src/lib/location/__tests__/utils.test.ts` | Tests for distance utilities |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/layout.tsx` | Wrap app in `UserLocationProvider` |
| `src/components/map/MapView.tsx` | Add `UserLocationLayer` and `LocateButton` |
| `src/app/list/page.tsx` | Add distance sort option, pass distance to `ItemCard` |
| `src/components/item/ItemCard.tsx` | Accept and render optional `distance` prop |
| `src/components/item/DetailPanel.tsx` | Show distance below status badge |
| `src/components/manage/UpdateForm.tsx` | Auto-select nearest item |
| `src/styles/globals.css` | Add blue dot pulse animation |

---

## Chunk 1: Location Utilities

### Task 1: Distance utility functions

**Files:**
- Create: `src/lib/location/utils.ts`
- Create: `src/lib/location/__tests__/utils.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// src/lib/location/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest';
import { distanceBetween, formatDistance, getDistanceToItem } from '../utils';

describe('distanceBetween', () => {
  it('returns 0 for same point', () => {
    expect(distanceBetween(47.6, -122.5, 47.6, -122.5)).toBe(0);
  });

  it('calculates distance between two known points', () => {
    // Seattle to Portland is ~278 km
    const d = distanceBetween(47.6062, -122.3321, 45.5152, -122.6784);
    expect(d).toBeGreaterThan(270000);
    expect(d).toBeLessThan(285000);
  });

  it('calculates short distance accurately', () => {
    // ~111 meters (0.001 degree latitude at equator)
    const d = distanceBetween(0, 0, 0.001, 0);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe('formatDistance', () => {
  it('formats short distances in feet', () => {
    expect(formatDistance(30)).toBe('98 ft'); // 30m * 3.28
  });

  it('formats medium distances in feet', () => {
    expect(formatDistance(100)).toBe('328 ft');
  });

  it('switches to miles at ~1000 ft (305m)', () => {
    expect(formatDistance(305)).toMatch(/mi$/);
  });

  it('formats miles with one decimal', () => {
    expect(formatDistance(1609)).toBe('1.0 mi'); // 1 mile
  });

  it('formats longer distances', () => {
    expect(formatDistance(8046)).toBe('5.0 mi'); // 5 miles
  });
});

describe('getDistanceToItem', () => {
  it('returns null when position is null', () => {
    expect(getDistanceToItem(null, { latitude: 47.6, longitude: -122.5 })).toBeNull();
  });

  it('returns distance in meters when position is available', () => {
    const d = getDistanceToItem(
      { lat: 47.6, lng: -122.5 },
      { latitude: 47.601, longitude: -122.501 }
    );
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    expect(d!).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module `../utils` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/location/utils.ts

/**
 * Calculate distance between two coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function distanceBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;

/**
 * Format a distance in meters to a human-readable string.
 * Under 1000 ft → "350 ft", over → "0.8 mi"
 */
export function formatDistance(meters: number): string {
  const feet = meters * FEET_PER_METER;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = feet / FEET_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Get distance from a user position to an item.
 * Returns meters, or null if position is unavailable.
 */
export function getDistanceToItem(
  position: { lat: number; lng: number } | null,
  item: { latitude: number; longitude: number }
): number | null {
  if (!position) return null;
  return distanceBetween(position.lat, position.lng, item.latitude, item.longitude);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/location/utils.ts src/lib/location/__tests__/utils.test.ts
git commit -m "feat: add location distance utility functions with tests"
```

---

## Chunk 2: UserLocationProvider

### Task 2: Location context provider

**Files:**
- Create: `src/lib/location/provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the provider**

```tsx
// src/lib/location/provider.tsx
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
```

- [ ] **Step 2: Wire into layout.tsx**

In `src/app/layout.tsx`, add the import and wrap children:

```tsx
// Add import at top:
import { UserLocationProvider } from '@/lib/location/provider';

// Wrap inside ConfigProvider:
<ConfigProvider config={config} theme={theme}>
  <UserLocationProvider>
    <Navigation />
    <main className="flex-1">{children}</main>
  </UserLocationProvider>
</ConfigProvider>
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -v ".next/"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/location/provider.tsx src/app/layout.tsx
git commit -m "feat: add UserLocationProvider with GPS watchPosition"
```

---

## Chunk 3: Blue Dot, Locate Button, and MapView Integration

### Task 3: UserLocationLayer (blue dot + accuracy ring + smart centering)

**Files:**
- Create: `src/components/map/UserLocationLayer.tsx`
- Modify: `src/styles/globals.css` (add pulse animation)

- [ ] **Step 1: Add pulse animation CSS**

Append to `src/styles/globals.css` before the closing of the file:

```css
/* User location blue dot pulse */
@keyframes locationPulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.4); }
  100% { opacity: 1; transform: scale(1); }
}

.location-dot-pulse {
  animation: locationPulse 2s ease-in-out infinite;
}
```

- [ ] **Step 2: Write the UserLocationLayer component**

Uses two separate effects: one for layer lifecycle (create/destroy on mount/unmount), one for updating positions.

```tsx
// src/components/map/UserLocationLayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useUserLocation } from '@/lib/location/provider';
import { useConfig } from '@/lib/config/client';
import { distanceBetween } from '@/lib/location/utils';

const SMART_CENTER_RADIUS = 5000; // 5km

export default function UserLocationLayer() {
  const map = useMap();
  const config = useConfig();
  const { position, accuracy, isTracking } = useUserLocation();
  const dotRef = useRef<L.CircleMarker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const hasCenteredRef = useRef(false);

  // Layer lifecycle — create on mount, destroy on unmount
  useEffect(() => {
    return () => {
      if (dotRef.current) { dotRef.current.remove(); dotRef.current = null; }
      if (ringRef.current) { ringRef.current.remove(); ringRef.current = null; }
    };
  }, []);

  // Update position, create layers if needed
  useEffect(() => {
    if (!position) {
      // Remove layers if position lost
      if (dotRef.current) { dotRef.current.remove(); dotRef.current = null; }
      if (ringRef.current) { ringRef.current.remove(); ringRef.current = null; }
      return;
    }

    const latlng: L.LatLngExpression = [position.lat, position.lng];

    // Accuracy ring
    if (!ringRef.current) {
      ringRef.current = L.circle(latlng, {
        radius: accuracy || 50,
        color: 'transparent',
        fillColor: 'rgba(66, 133, 244, 0.15)',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      ringRef.current.setLatLng(latlng);
      if (accuracy) ringRef.current.setRadius(accuracy);
    }

    // Blue dot
    if (!dotRef.current) {
      dotRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#4285F4',
        fillOpacity: 1,
        interactive: false,
        className: isTracking ? 'location-dot-pulse' : '',
      }).addTo(map);
    } else {
      dotRef.current.setLatLng(latlng);
    }

    // Smart centering — only on first position
    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      const distToCenter = distanceBetween(
        position.lat, position.lng,
        config.mapCenter.lat, config.mapCenter.lng
      );
      if (distToCenter <= SMART_CENTER_RADIUS) {
        map.flyTo(latlng, map.getZoom(), { duration: 1 });
      }
    }
  }, [position, accuracy, isTracking, map, config.mapCenter]);

  return null; // Renders via Leaflet layers, not React DOM
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -v ".next/"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/map/UserLocationLayer.tsx src/styles/globals.css
git commit -m "feat: add UserLocationLayer with blue dot, accuracy ring, smart centering"
```

### Task 4: LocateButton and MapView integration

**Files:**
- Create: `src/components/map/LocateButton.tsx`
- Modify: `src/components/map/MapView.tsx`

**Architecture note:** `LocateButton` is placed **outside** `MapContainer` (so it renders as normal DOM with absolute positioning). A tiny `FlyToUser` helper inside `MapContainer` uses `useMap()` to execute the fly-to when triggered. This avoids the constraint that `useMap()` can only be called inside `MapContainer` children.

- [ ] **Step 1: Write LocateButton**

```tsx
// src/components/map/LocateButton.tsx
'use client';

import { useState } from 'react';
import { useUserLocation } from '@/lib/location/provider';

interface LocateButtonProps {
  onLocate: () => void;
}

export default function LocateButton({ onLocate }: LocateButtonProps) {
  const { position, error, isTracking, startTracking } = useUserLocation();
  const [showToast, setShowToast] = useState(false);

  // Hide entirely if geolocation unavailable
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
```

- [ ] **Step 2: Update MapView**

In `src/components/map/MapView.tsx`, add these imports:

```typescript
import UserLocationLayer from './UserLocationLayer';
import LocateButton from './LocateButton';
import { useUserLocation } from '@/lib/location/provider';
```

Add a `FlyToUser` helper component (defined above the `MapView` export or inline):

```tsx
/** Flies map to user position when trigger increments */
function FlyToUser({ trigger }: { trigger: number }) {
  const map = useMap();
  const { position } = useUserLocation();
  useEffect(() => {
    if (trigger > 0 && position) {
      map.flyTo([position.lat, position.lng], map.getZoom(), { duration: 1 });
    }
  }, [trigger, position, map]);
  return null;
}
```

Add state inside the `MapView` component:

```typescript
const [flyToUserTrigger, setFlyToUserTrigger] = useState(0);
```

Add inside `<MapContainer>`, after the `ItemMarker` map loop:

```tsx
        <UserLocationLayer />
        <FlyToUser trigger={flyToUserTrigger} />
      </MapContainer>
```

Add outside `<MapContainer>`, after the fullscreen button and before `<MapLegend>`:

```tsx
      <LocateButton onLocate={() => setFlyToUserTrigger((n) => n + 1)} />
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -v ".next/"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/map/LocateButton.tsx src/components/map/MapView.tsx
git commit -m "feat: add LocateButton and wire location layer into MapView"
```

---

## Chunk 4: Distance in List and Detail Views

### Task 6: Add distance to ItemCard

**Files:**
- Modify: `src/components/item/ItemCard.tsx`

- [ ] **Step 1: Add optional distance prop**

Add a `distance` prop (in meters, or null) to `ItemCardProps`:

```typescript
interface ItemCardProps {
  item: Item;
  itemType?: ItemType;
  customFields?: CustomField[];
  distance?: number | null;
}
```

Update the component signature:

```typescript
export default function ItemCard({ item, itemType, customFields, distance }: ItemCardProps) {
```

Add distance display after the coordinates span, inside the bottom `div`:

```tsx
<div className="flex items-center justify-between text-xs text-sage">
  {itemType && <span>{itemType.name}</span>}
  <div className="flex items-center gap-2">
    {distance != null && (
      <span className="text-forest font-medium">{formatDistance(distance)}</span>
    )}
    <span>
      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
    </span>
  </div>
</div>
```

Add import:

```typescript
import { formatDistance } from '@/lib/location/utils';
```

- [ ] **Step 2: Commit**

```bash
git add src/components/item/ItemCard.tsx
git commit -m "feat: add distance display to ItemCard"
```

### Task 7: Add distance sort to list page

**Files:**
- Modify: `src/app/list/page.tsx`

- [ ] **Step 1: Update sort type and add distance sort**

Change the SortOption type:

```typescript
type SortOption = 'name' | 'date' | 'status' | 'distance';
```

Add imports:

```typescript
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem } from '@/lib/location/utils';
```

Inside the component, get position:

```typescript
const { position } = useUserLocation();
```

Add distance case to the sort switch:

```typescript
case 'distance': {
  if (!position) return 0;
  const dA = getDistanceToItem(position, a) ?? Infinity;
  const dB = getDistanceToItem(position, b) ?? Infinity;
  return dA - dB;
}
```

Add the distance option to the sort dropdown (only when position available):

```tsx
<option value="name">Name</option>
<option value="date">Date</option>
<option value="status">Status</option>
{position && <option value="distance">Distance</option>}
```

Pass distance to each ItemCard:

```tsx
<ItemCard
  key={item.id}
  item={item}
  itemType={typeMap.get(item.item_type_id)}
  customFields={customFields.filter((f) => f.item_type_id === item.item_type_id)}
  distance={getDistanceToItem(position, item)}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/list/page.tsx
git commit -m "feat: add distance sort and display to list page"
```

### Task 8: Add distance to DetailPanel

**Files:**
- Modify: `src/components/item/DetailPanel.tsx`

- [ ] **Step 1: Add distance display below status badge**

Add imports:

```typescript
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem, formatDistance } from '@/lib/location/utils';
```

Inside the component, get position and calculate distance:

```typescript
const { position } = useUserLocation();
const distance = getDistanceToItem(position, item);
```

Add after the `<StatusBadge status={item.status} />` line:

```tsx
<StatusBadge status={item.status} />
{distance != null && (
  <span className="ml-2 text-xs text-forest">
    📍 {formatDistance(distance)} away
  </span>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/item/DetailPanel.tsx
git commit -m "feat: add distance display to DetailPanel"
```

---

## Chunk 5: Smart Pre-Selection

### Task 9: Auto-select nearest item in UpdateForm

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx`

- [ ] **Step 1: Add auto-selection logic**

Add imports:

```typescript
import { useUserLocation } from '@/lib/location/provider';
import { getDistanceToItem } from '@/lib/location/utils';
```

Inside the component, get position:

```typescript
const { position } = useUserLocation();
const [autoSelected, setAutoSelected] = useState(false);
const hasAttemptedAutoSelect = useRef(false);
```

Add `useRef` to the imports from React.

Add an effect after items are loaded that auto-selects the nearest item (runs once):

```typescript
useEffect(() => {
  if (hasAttemptedAutoSelect.current) return;
  if (!position || items.length === 0) return;

  hasAttemptedAutoSelect.current = true;
  const AUTO_SELECT_RADIUS = 100; // meters

  let nearest: { id: string; distance: number } | null = null;
  for (const item of items) {
    const d = getDistanceToItem(position, item);
    if (d !== null && d <= AUTO_SELECT_RADIUS) {
      if (!nearest || d < nearest.distance) {
        nearest = { id: item.id, distance: d };
      }
    }
  }

  if (nearest) {
    setItemId(nearest.id);
    setAutoSelected(true);
  }
}, [position, items]);
```

Add a hint below the item dropdown (after the `</select>`):

```tsx
{autoSelected && (
  <p className="text-xs text-forest mt-1">
    📍 Auto-selected — you appear to be near this item
  </p>
)}
```

Reset `autoSelected` when user manually changes selection:

```tsx
<select
  ...
  onChange={(e) => {
    setItemId(e.target.value);
    setAutoSelected(false);
  }}
>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/manage/UpdateForm.tsx
git commit -m "feat: auto-select nearest item in UpdateForm"
```

---

## Chunk 6: Verification

### Task 10: Run all tests and verify build

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: All tests pass (existing 38 + new location utils tests)

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -v ".next/"`
Expected: No errors

- [ ] **Step 3: Lint**

Run: `npx next lint`
Expected: No new errors

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: user location feature cleanup"
```

---

## Summary

After implementation:

- **`UserLocationProvider`** wraps the app, calls `watchPosition()`, exposes position via `useUserLocation()` hook
- **Blue dot + accuracy ring** on the map via `UserLocationLayer` (Leaflet native layers)
- **"Locate Me" button** bottom-right, handles permission denied with toast
- **Smart centering** flies to user on first load if within 5km of configured center
- **Distance in list/detail** — sort by distance, "350 ft" labels on cards, "📍 0.3 mi away" in detail panel
- **Smart pre-selection** — auto-selects nearest item (< 100m) in UpdateForm
- **Graceful degradation** — everything works without location permission
