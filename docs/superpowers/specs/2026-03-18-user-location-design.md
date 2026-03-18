# User Location Feature — Design Spec

## Overview

Add continuous GPS tracking to the Field Mapper app so the user's position is always visible on the map, distances to items are shown in list and detail views, and the nearest item is auto-selected when adding updates in the field.

## Goals

- **Always-visible blue dot** on the map with accuracy ring, standard Google Maps / Apple Maps style
- **Distance awareness** in list view and detail panel ("350 ft away")
- **Smart centering** — auto-center on user if near the configured area, configured center otherwise
- **Smart pre-selection** — auto-select nearest item when adding an update in the field
- **Graceful degradation** — everything works without location, just no blue dot or distances

## Approach

**Hybrid: Leaflet Locate + Custom Context (Approach C)**

Leaflet's native `L.circleMarker` and `L.circle` handle the blue dot and accuracy ring on the map. A React context (`UserLocationProvider`) wraps the app and makes position data available everywhere — list page distances, detail panel, and form pre-selection.

---

## Section 1: UserLocationProvider

React context provider wrapping the app in `layout.tsx` alongside `ConfigProvider`.

### State

| Field | Type | Description |
|-------|------|-------------|
| `position` | `{ lat: number; lng: number } \| null` | Current coordinates |
| `accuracy` | `number \| null` | GPS accuracy in meters |
| `heading` | `number \| null` | Compass heading if available |
| `error` | `string \| null` | `'denied'`, `'unavailable'`, or error message |
| `isTracking` | `boolean` | Whether watchPosition is active |

### Behavior

- On mount, calls `navigator.geolocation.watchPosition()` with `enableHighAccuracy: true`
- Throttles state updates to max once per 2 seconds to avoid excessive re-renders
- If permission denied, sets `error = 'denied'` and `isTracking = false`
- Exposes `startTracking()` method for "Locate Me" button to retry after denial
- Cleans up watcher on unmount

### Hook API

```typescript
const { position, accuracy, error, isTracking, startTracking } = useUserLocation();
```

### Utility Functions (pure, testable)

```typescript
distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number): number
// Returns distance in meters using Haversine formula

formatDistance(meters: number): string
// < 1000 ft → "350 ft", >= 1000 ft → "0.8 mi"

getDistanceToItem(position: { lat: number; lng: number } | null, item: { latitude: number; longitude: number }): number | null
// Returns meters or null if position unavailable
```

### Files

- Create: `src/lib/location/provider.tsx` — UserLocationProvider, useUserLocation hook
- Create: `src/lib/location/utils.ts` — distanceBetween, formatDistance, getDistanceToItem
- Modify: `src/app/layout.tsx` — wrap app in UserLocationProvider

---

## Section 2: Blue Dot on the Map

`UserLocationLayer` component rendered inside `MapView`'s `MapContainer`.

### What It Renders

- **Blue dot** — `L.circleMarker` with radius 8px, fill `#4285F4` (Google blue), white 2px border. Fixed pixel size at all zoom levels.
- **Accuracy ring** — `L.circle` with GPS accuracy radius in meters. Translucent blue fill (`rgba(66, 133, 244, 0.15)`), no border. Scales with zoom since it represents real-world distance.
- **Pulse animation** — CSS animation on the blue dot, subtle pulse every 2 seconds to signal live tracking.

### Smart Centering

On first position received:
- Calculate distance from user to `config.mapCenter`
- If within 5km, fly to user's position at current zoom level
- If farther, stay at configured center (user is browsing remotely)
- "Locate Me" button always available — flies to user regardless of distance

### "Locate Me" Button

- Position: bottom-right of map, `bottom-20 right-4` on mobile (above tab bar), `bottom-6 right-4` on desktop
- Icon: crosshair/compass SVG
- If not tracking (permission denied), tapping calls `startTracking()` which re-requests permission
- If already tracking, flies map to current position
- If denied and can't re-prompt, shows toast: "Location access was denied. Enable it in your browser settings."
- 44x44px minimum touch target

### Reads From

- `useUserLocation()` context — no duplicate GPS calls
- Updates dot/ring when context position changes
- If position is null (no permission), renders nothing

### Files

- Create: `src/components/map/UserLocationLayer.tsx` — blue dot + accuracy ring + smart centering
- Create: `src/components/map/LocateButton.tsx` — "Locate Me" button
- Modify: `src/components/map/MapView.tsx` — add UserLocationLayer and LocateButton

---

## Section 3: Distance in List View and Detail Panel

### List Page (`/list`)

- New sort option: **"Distance"** (alongside Name, Date, Status)
- Only enabled when user position is available (hidden otherwise)
- Each `ItemCard` shows distance text below coordinates: "350 ft" or "0.8 mi"
- Distance only renders when position is available — no placeholder or error
- When sorted by distance, nearest items appear first

### Detail Panel

- Below the status badge, show `📍 120 ft away` (or `📍 0.3 mi away`)
- Only renders when position is available
- No error state, no placeholder — just absent when no position

### Distance Formatting

- Under 1000 ft: show feet (e.g., "350 ft")
- 1000 ft and over: show miles with one decimal (e.g., "0.8 mi")
- Conversion: 1 meter = 3.28084 feet, 1 mile = 5280 feet

### Files

- Modify: `src/app/list/page.tsx` — add distance sort option, pass position to ItemCard
- Modify: `src/components/item/ItemCard.tsx` — accept optional distance prop, render distance text
- Modify: `src/components/item/DetailPanel.tsx` — show distance below status badge

---

## Section 4: Smart Pre-Selection in Update Form

### Add Update (`/manage/update`)

- After items load, if user position is available, calculate distance to each item
- If nearest item is within 100 meters (~330 ft), auto-select it in the dropdown
- Show hint below dropdown: `📍 Auto-selected — you appear to be near this item`
- User can change selection freely — it's a convenience, not a lock

### Edge Cases

- Multiple items within 100m → pick the closest one
- No items within 100m → no auto-selection, normal dropdown
- Position unavailable → behave exactly as today (no auto-selection)

### Files

- Modify: `src/components/manage/UpdateForm.tsx` — add auto-selection logic using useUserLocation

---

## Section 5: Permission Flow and Error Handling

### On Map Load

- `UserLocationProvider` calls `watchPosition()` immediately on mount
- Browser shows native permission prompt
- No custom pre-prompt — map context makes the reason obvious

### Permission Granted

- Blue dot appears, smart centering kicks in
- Distances populate in list and detail views
- Smart pre-selection active in forms

### Permission Denied

- `error = 'denied'`, `isTracking = false`
- No blue dot, no distances — everything else works normally
- "Locate Me" button shows crossed-out location icon
- Tapping shows toast: "Location access was denied. Enable it in your browser settings."

### Geolocation Unavailable

- `error = 'unavailable'`
- Same graceful degradation
- "Locate Me" button hidden entirely

### GPS Signal Lost

- Keep showing last known position
- Stop pulse animation to indicate stale position
- Accuracy ring reflects degraded accuracy if API reports it

### HTTPS

- Required in production (Vercel handles this)
- `localhost` exempted by browsers for development

---

## Section 6: Mobile UX

### Layout

- Legend: bottom-left (`bottom-20 left-4` mobile, `bottom-6 left-4` desktop)
- "Locate Me" button: bottom-right (`bottom-20 right-4` mobile, `bottom-6 right-4` desktop)
- Both sit above the mobile bottom tab bar

### Performance

- `watchPosition` with `enableHighAccuracy: true` — expected battery usage for field app
- Position state throttled to 2-second updates
- Distance calculations use Haversine — negligible CPU
- Blue dot and accuracy ring are native Leaflet layers, not React components

### Touch

- Blue dot is non-interactive — no tap handler, won't conflict with item markers
- "Locate Me" button: 44x44px minimum touch target
- Accuracy ring is semi-transparent and below markers in z-order

### Offline / Weak Signal

- GPS works without cell service (satellite-based)
- Accuracy ring communicates uncertainty visually
- Map tiles may stop loading without internet — not in scope for this feature

---

## Implementation Order

1. **Location utilities** — `distanceBetween`, `formatDistance`, `getDistanceToItem` (pure functions, testable)
2. **UserLocationProvider** — context with `watchPosition`, throttling, error handling
3. **UserLocationLayer + LocateButton** — blue dot, accuracy ring, smart centering on map
4. **Distance in list/detail** — sort by distance, distance labels
5. **Smart pre-selection** — auto-select in UpdateForm
