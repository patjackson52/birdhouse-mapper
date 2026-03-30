# Photo Source Picker — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add Google Photos as a photo source across all 5 upload sites in FieldMapper via a reusable `PhotoSourcePicker` component. Users can browse their Google Photos library (recent, albums, search) alongside the existing device camera/gallery file picker. Selected Google Photos are downloaded server-side, resized client-side, and uploaded to Supabase storage — the rest of the app doesn't know or care where the photo came from.

## Goals

- Google Photos browsing (recent, albums, search) as a photo source across all upload sites
- Reusable component with a plugin architecture for future sources (Dropbox, iCloud, etc.)
- Zero changes to existing upload/storage logic — the component returns `File[]` like today
- Graceful degradation when Google credentials aren't configured
- Mobile-friendly experience for field workers

## Approach

**Google Picker API + Abstraction Layer (Approach C):** Use Google's official Picker API for the browsing UI (Google maintains it, it's responsive, supports albums + search). Wrap it in a `PhotoSourcePicker` component that abstracts the source behind a common `File[]` interface. Each upload site swaps in `<PhotoSourcePicker>` and keeps its existing submit handler unchanged.

---

## 1. PhotoSourcePicker Component

### Props Interface

```typescript
interface PhotoSourcePickerProps {
  accept: string;                        // MIME types (e.g., "image/*")
  maxFiles?: number;                     // default 5
  maxWidth?: number;                     // resize target in px (1200 for items, 2000 for landing)
  capture?: string;                      // camera capture attribute ("environment")
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;                    // default true
}
```

### Internal Structure

```
PhotoSourcePicker
├── Source selector tab bar: "Device" | "Google Photos"
├── DeviceSource — wraps existing <input type="file"> + drag-drop
└── GooglePhotosSource — Google Picker API integration
```

The component returns `File[]` to the parent — identical interface to the current file inputs. Parents don't know or care whether files came from device or Google Photos. This means zero changes to existing upload/storage logic.

### Source Selector

A simple tab bar at the top of the component:

```
[ Device ]  [ Google Photos ]
```

- **Device tab** renders the existing file input behavior (file picker, drag-drop, camera capture on mobile)
- **Google Photos tab** triggers the Google Picker modal
- If Google env vars are not set, the Google Photos tab doesn't render — device-only mode, identical to current behavior

---

## 2. Google Photos Integration

### OAuth Flow

1. App loads Google Picker JS SDK dynamically (`https://apis.google.com/js/api.js`)
2. User clicks "Google Photos" tab
3. App requests OAuth token via Google Identity Services — scope: `https://www.googleapis.com/auth/photoslibrary.readonly`
4. Google shows consent screen (first time) or silently returns token (subsequent in same session)
5. App opens Google Picker configured for Google Photos view
6. User browses (recent, albums, search), selects photos
7. Picker returns selected items with metadata (URLs, dimensions, MIME types)

Session-based authentication — no persistent token storage. Future upgrade path: linked account in user profile settings.

### Server-Side Proxy + Client Resize

Google Photos URLs require the OAuth token and can't be fetched client-side (CORS). The flow:

1. Client sends one photo URL + OAuth access token per request to a Next.js API route (one request per photo, fetched in parallel)
2. API route fetches the image from Google using the token, streams back raw bytes
3. Client creates `File` objects from the bytes
4. Client-side `resizeImage()` runs (same as today for device photos)
5. `onFilesSelected` callback fires with the resized `File[]`
6. Parent handles upload to Supabase storage (unchanged)

This keeps the GooglePhotosSource output identical to DeviceSource — `File[]` after resize.

### Loading & Error States

**During download:** Progress indicator — "Downloading 3 photos..." with count as each completes.

**Errors:**
- Google auth denied/failed: "Couldn't connect to Google Photos. Try again or use Device."
- Proxy download fails for one photo: skip it, show warning "1 of 3 photos couldn't be downloaded"
- Picker closed without selection: no-op, return to source selector

---

## 3. Integration Points (All 5 Upload Sites)

### PhotoUploader.tsx (Items + Updates)

Replace `<input type="file">` with `<PhotoSourcePicker>`:

```tsx
<PhotoSourcePicker
  accept="image/*"
  maxFiles={5}
  maxWidth={1200}
  capture="environment"
  onFilesSelected={handlePhotosSelected}
/>
```

`handlePhotosSelected` callback unchanged — receives `File[]`, adds to component state.

### FileDropZone.tsx (AI Context)

Add "Google Photos" as a 4th tab alongside Files / URL / Text. The Google Photos tab uses `GooglePhotosSource` directly. Only appears when accept types include images — hidden for text/document-only contexts.

### AssetManager.tsx (Landing Page)

Replace the file input section with `<PhotoSourcePicker>`:

```tsx
<PhotoSourcePicker
  accept="image/*"
  maxFiles={20}
  maxWidth={2000}
  onFilesSelected={handleImageUpload}
/>
```

### OverlayEditor.tsx (Map Overlay)

Add `<PhotoSourcePicker>` alongside the existing URL input. Single-select mode:

```tsx
<PhotoSourcePicker
  accept="image/png,image/jpeg,image/webp"
  maxFiles={1}
  maxWidth={4000}
  multiple={false}
  onFilesSelected={handleOverlayImage}
/>
```

---

## 4. File Structure

### New Files

```
src/
  components/photos/
    PhotoSourcePicker.tsx    — Main reusable component (source tabs + delegation)
    DeviceSource.tsx         — Wraps existing file input / drag-drop behavior
    GooglePhotosSource.tsx   — Google Picker integration + file conversion
  lib/google/
    picker.ts               — Load Picker SDK, configure, open picker
  app/api/photos/
    proxy/route.ts           — Proxy Google Photos downloads (avoids CORS)
```

### Existing Files Modified

| File | Change |
|------|--------|
| `src/components/manage/PhotoUploader.tsx` | Replace `<input type="file">` with `<PhotoSourcePicker>` |
| `src/components/ai-context/FileDropZone.tsx` | Add Google Photos as 4th tab |
| `src/components/admin/landing/AssetManager.tsx` | Replace file input with `<PhotoSourcePicker>` |
| `src/components/manage/OverlayEditor.tsx` | Add PhotoSourcePicker alongside URL input |

---

## 5. Environment & Configuration

### Google Cloud Setup (One-Time)

1. Create or use existing Google Cloud project
2. Enable **Google Picker API**
3. Create **OAuth 2.0 Client ID** (Web application type)
   - Authorized JS origins: `http://localhost:3000`, production domain
4. Create **API Key** (restricted to Picker API)

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client | OAuth consent flow |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Client | Picker API initialization |

Both are public (`NEXT_PUBLIC_` prefix) — designed to be browser-visible. The OAuth token is short-lived and never stored.

### Graceful Degradation

If Google env vars are not set, the "Google Photos" tab doesn't render. PhotoSourcePicker falls back to device-only mode — identical to current behavior. No errors, no broken UI.

### No New NPM Packages

Google Picker JS SDK and Google Identity Services load dynamically via `<script>` tags — standard Google pattern, no npm dependency.

---

## 6. Mobile Experience

The Google Picker is responsive and works on mobile browsers. Typical field worker flow:

1. User taps "Add Photo" on an item update
2. PhotoSourcePicker shows Device / Google Photos tabs
3. **Device path:** OS camera/gallery picker (same as today)
4. **Google Photos path:** Picker opens as overlay → browse/search → select → download via proxy → files returned

Touch targets meet 44px minimum throughout. Same upload limits apply regardless of source.

---

## 7. Limits & Constraints

Existing limits apply uniformly across all sources:

| Upload Site | Max Files | Resize Width | Accept |
|-------------|-----------|-------------|--------|
| Item/Update photos | 5 | 1200px | image/* |
| AI Context | Per FileDropZone config | N/A (raw) | image/*, plus non-image types |
| Landing assets | 20 | 2000px | image/* |
| Map overlay | 1 | 4000px | image/png, jpeg, webp |

---

## 8. Future Extension

The plugin architecture supports adding sources without modifying PhotoSourcePicker:

- Each source implements: trigger selection → return `File[]`
- New source = new component + new tab entry
- Candidates: Dropbox (Chooser API), OneDrive (File Picker), iCloud (limited web API)
- Persistent account linking via user profile settings (store refresh tokens in `user_connected_accounts` table)
