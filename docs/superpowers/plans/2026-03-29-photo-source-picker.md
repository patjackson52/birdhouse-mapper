# Photo Source Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Photos as a photo source across all 5 upload sites via a reusable `PhotoSourcePicker` component.

**Architecture:** Google Picker API provides the browsing UI. A `PhotoSourcePicker` component abstracts device file input and Google Photos behind a common `File[]` interface. A Next.js API route proxies Google Photos downloads to avoid CORS. Each upload site swaps in the new component with zero changes to its upload/storage logic.

**Tech Stack:** Google Picker API (dynamic script load), Google Identity Services, Next.js API routes, existing `resizeImage()` utility

**Spec:** `docs/superpowers/specs/2026-03-29-photo-source-picker-design.md`

---

### Task 1: Environment Variables & Configuration

**Files:**
- Modify: `.env.local.example` (or `.env.example`)

- [ ] **Step 1: Add Google env vars to the example file**

Add these lines to the env example file:

```bash
# Google Photos integration (optional — omit to disable Google Photos source)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_GOOGLE_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore: add Google Photos env vars to env example"
```

---

### Task 2: Google Picker SDK Loader

**Files:**
- Create: `src/lib/google/picker.ts`
- Create: `src/__tests__/google/picker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/google/picker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isGooglePhotosConfigured } from '@/lib/google/picker';

describe('isGooglePhotosConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns true when both env vars are set', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = 'test-api-key';
    expect(isGooglePhotosConfigured()).toBe(true);
  });

  it('returns false when client ID is missing', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = 'test-api-key';
    expect(isGooglePhotosConfigured()).toBe(false);
  });

  it('returns false when API key is missing', () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = '';
    expect(isGooglePhotosConfigured()).toBe(false);
  });

  it('returns false when both are missing', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    expect(isGooglePhotosConfigured()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/google/picker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/google/picker.ts`:

```typescript
/** Check if Google Photos integration is configured */
export function isGooglePhotosConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  );
}

const PICKER_API_URL = 'https://apis.google.com/js/api.js';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.readonly';

let pickerApiLoaded = false;
let gisLoaded = false;

/** Load a script tag dynamically, resolves when loaded */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/** Load Google Picker API */
async function loadPickerApi(): Promise<void> {
  if (pickerApiLoaded) return;
  await loadScript(PICKER_API_URL);
  await new Promise<void>((resolve) => {
    (window as any).gapi.load('picker', { callback: resolve });
  });
  pickerApiLoaded = true;
}

/** Load Google Identity Services */
async function loadGis(): Promise<void> {
  if (gisLoaded) return;
  await loadScript(GIS_URL);
  gisLoaded = true;
}

/** Request an OAuth access token via Google Identity Services */
function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: PHOTOS_SCOPE,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

export interface PickerResult {
  url: string;
  name: string;
  mimeType: string;
}

/** Open Google Picker for Photos and return selected items */
export async function openGooglePhotosPicker(maxFiles: number): Promise<PickerResult[]> {
  await Promise.all([loadPickerApi(), loadGis()]);

  const accessToken = await requestAccessToken();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY!;

  return new Promise((resolve) => {
    const google = (window as any).google;
    const picker = new google.picker.PickerBuilder()
      .addView(
        new google.picker.PhotosView()
          .setType(google.picker.PhotosView.Type.FLAT)
      )
      .addView(
        new google.picker.PhotoAlbumsView()
      )
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setMaxItems(maxFiles)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const results: PickerResult[] = data.docs.map((doc: any) => ({
            url: doc.url,
            name: doc.name || 'photo.jpg',
            mimeType: doc.mimeType || 'image/jpeg',
          }));
          resolve(results);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/google/picker.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/google/picker.ts src/__tests__/google/picker.test.ts
git commit -m "feat: add Google Picker SDK loader and configuration"
```

---

### Task 3: Photo Proxy API Route

**Files:**
- Create: `src/app/api/photos/proxy/route.ts`
- Create: `src/app/api/photos/__tests__/proxy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/photos/__tests__/proxy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('photos proxy route', () => {
  it('rejects requests without url parameter', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('url');
  });

  it('rejects requests without token parameter', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://lh3.googleusercontent.com/test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('token');
  });

  it('rejects non-Google URLs', async () => {
    const { POST } = await import('../proxy/route');
    const request = new Request('http://localhost/api/photos/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://evil.com/hack.jpg', token: 'test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Google');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/app/api/photos/__tests__/proxy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the proxy route**

Create `src/app/api/photos/proxy/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'photos.google.com',
  'video.google.com',
];

export async function POST(request: NextRequest) {
  let body: { url?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, token } = body;

  if (!url) {
    return NextResponse.json({ error: 'Missing required parameter: url' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing required parameter: token' }, { status: 400 });
  }

  // Validate URL is from Google
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: 'Only Google Photos URLs are allowed' },
      { status: 400 }
    );
  }

  // Fetch the image from Google using the OAuth token
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google returned ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch image from Google' },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/app/api/photos/__tests__/proxy.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/photos/proxy/route.ts src/app/api/photos/__tests__/proxy.test.ts
git commit -m "feat: add Google Photos proxy API route"
```

---

### Task 4: DeviceSource Component

**Files:**
- Create: `src/components/photos/DeviceSource.tsx`

- [ ] **Step 1: Create the DeviceSource component**

This extracts the existing file input pattern from PhotoUploader into a standalone component:

Create `src/components/photos/DeviceSource.tsx`:

```typescript
'use client';

import { useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface DeviceSourceProps {
  accept: string;
  maxFiles: number;
  capture?: string;
  multiple: boolean;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

/** Parse an accept string like "image/*" or "image/png,image/jpeg" into a react-dropzone accept object */
function parseAccept(accept: string): Record<string, string[]> {
  const types = accept.split(',').map((t) => t.trim());
  const result: Record<string, string[]> = {};
  for (const type of types) {
    result[type] = [];
  }
  return result;
}

export default function DeviceSource({
  accept,
  maxFiles,
  capture,
  multiple,
  onFilesSelected,
  disabled = false,
}: DeviceSourceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (disabled || acceptedFiles.length === 0) return;
      const limited = acceptedFiles.slice(0, maxFiles);
      onFilesSelected(limited);
    },
    [disabled, maxFiles, onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: parseAccept(accept),
    maxFiles,
    multiple,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input {...getInputProps()} capture={capture} />
      <p className="text-gray-600 mb-1">
        {isDragActive ? 'Drop files here' : 'Drop files here or tap to browse'}
      </p>
      <p className="text-xs text-gray-400">
        {multiple ? `Up to ${maxFiles} files` : '1 file'}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/photos/DeviceSource.tsx
git commit -m "feat: add DeviceSource component for local file selection"
```

---

### Task 5: GooglePhotosSource Component

**Files:**
- Create: `src/components/photos/GooglePhotosSource.tsx`

- [ ] **Step 1: Create the GooglePhotosSource component**

Create `src/components/photos/GooglePhotosSource.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { openGooglePhotosPicker, type PickerResult } from '@/lib/google/picker';
import { resizeImage } from '@/lib/utils';

interface GooglePhotosSourceProps {
  maxFiles: number;
  maxWidth?: number;
  onFilesSelected: (files: File[]) => void;
}

type Status = 'idle' | 'authenticating' | 'downloading' | 'error';

export default function GooglePhotosSource({
  maxFiles,
  maxWidth,
  onFilesSelected,
}: GooglePhotosSourceProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  async function handleBrowse() {
    setStatus('authenticating');
    setErrorMessage('');

    let pickerResults: PickerResult[];
    try {
      pickerResults = await openGooglePhotosPicker(maxFiles);
    } catch (err) {
      setStatus('error');
      setErrorMessage("Couldn't connect to Google Photos. Try again or use Device.");
      return;
    }

    if (pickerResults.length === 0) {
      setStatus('idle');
      return;
    }

    setStatus('downloading');
    setProgress({ done: 0, total: pickerResults.length });

    // Fetch each photo via the proxy route, in parallel
    const files: File[] = [];
    let failCount = 0;

    // Get the access token from the picker SDK (it's cached in the GIS client)
    const accessToken = (window as any).google?.accounts?.oauth2?.getToken?.()?.access_token;

    await Promise.all(
      pickerResults.map(async (result) => {
        try {
          const response = await fetch('/api/photos/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: result.url, token: accessToken }),
          });

          if (!response.ok) {
            failCount++;
            return;
          }

          const blob = await response.blob();
          let finalBlob: Blob = blob;

          // Resize if maxWidth is set
          if (maxWidth) {
            try {
              const tempFile = new File([blob], result.name, { type: result.mimeType });
              finalBlob = await resizeImage(tempFile, maxWidth);
            } catch {
              // If resize fails, use original blob
            }
          }

          files.push(new File([finalBlob], result.name, { type: result.mimeType }));
        } catch {
          failCount++;
        } finally {
          setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      })
    );

    if (files.length > 0) {
      onFilesSelected(files);
    }

    if (failCount > 0 && files.length > 0) {
      setStatus('error');
      setErrorMessage(`${failCount} of ${pickerResults.length} photos couldn't be downloaded`);
    } else if (files.length === 0) {
      setStatus('error');
      setErrorMessage("Couldn't download any photos. Please try again.");
    } else {
      setStatus('idle');
    }
  }

  return (
    <div className="text-center py-8">
      {status === 'idle' && (
        <div>
          <button
            type="button"
            onClick={handleBrowse}
            className="btn-primary"
          >
            Browse Google Photos
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Select up to {maxFiles} photos from your Google Photos library
          </p>
        </div>
      )}

      {status === 'authenticating' && (
        <p className="text-sm text-gray-600">Connecting to Google Photos...</p>
      )}

      {status === 'downloading' && (
        <div>
          <p className="text-sm text-gray-600">
            Downloading {progress.done} of {progress.total} photos...
          </p>
          <div className="w-48 mx-auto mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-red-600 mb-2">{errorMessage}</p>
          <button
            type="button"
            onClick={handleBrowse}
            className="btn-secondary text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/photos/GooglePhotosSource.tsx
git commit -m "feat: add GooglePhotosSource component with Picker + proxy download"
```

---

### Task 6: PhotoSourcePicker Component

**Files:**
- Create: `src/components/photos/PhotoSourcePicker.tsx`

- [ ] **Step 1: Create the main PhotoSourcePicker component**

Create `src/components/photos/PhotoSourcePicker.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { isGooglePhotosConfigured } from '@/lib/google/picker';
import DeviceSource from './DeviceSource';
import GooglePhotosSource from './GooglePhotosSource';

interface PhotoSourcePickerProps {
  accept: string;
  maxFiles?: number;
  maxWidth?: number;
  capture?: string;
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
}

type Source = 'device' | 'google';

export default function PhotoSourcePicker({
  accept,
  maxFiles = 5,
  maxWidth,
  capture,
  onFilesSelected,
  multiple = true,
}: PhotoSourcePickerProps) {
  const googleConfigured = isGooglePhotosConfigured();
  const [activeSource, setActiveSource] = useState<Source>('device');

  // If Google is not configured, render device-only (no tabs)
  if (!googleConfigured) {
    return (
      <DeviceSource
        accept={accept}
        maxFiles={maxFiles}
        capture={capture}
        multiple={multiple}
        onFilesSelected={onFilesSelected}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Source tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveSource('device')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeSource === 'device'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Device
        </button>
        <button
          type="button"
          onClick={() => setActiveSource('google')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeSource === 'google'
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Google Photos
        </button>
      </div>

      {/* Active source */}
      {activeSource === 'device' && (
        <DeviceSource
          accept={accept}
          maxFiles={maxFiles}
          capture={capture}
          multiple={multiple}
          onFilesSelected={onFilesSelected}
        />
      )}

      {activeSource === 'google' && (
        <GooglePhotosSource
          maxFiles={maxFiles}
          maxWidth={maxWidth}
          onFilesSelected={onFilesSelected}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/photos/PhotoSourcePicker.tsx
git commit -m "feat: add PhotoSourcePicker with device and Google Photos sources"
```

---

### Task 7: Integrate into PhotoUploader

**Files:**
- Modify: `src/components/manage/PhotoUploader.tsx`

- [ ] **Step 1: Read the current PhotoUploader**

Read `src/components/manage/PhotoUploader.tsx` to confirm current structure.

- [ ] **Step 2: Replace the file input with PhotoSourcePicker**

The current component has an `<input type="file">` and handles resize internally. Replace it to use `PhotoSourcePicker` while keeping the preview/remove UI:

```typescript
'use client';

import { useState } from 'react';
import { resizeImage } from '@/lib/utils';
import PhotoSourcePicker from '@/components/photos/PhotoSourcePicker';

interface PhotoUploaderProps {
  onPhotosSelected: (files: File[]) => void;
  maxFiles?: number;
}

export default function PhotoUploader({
  onPhotosSelected,
  maxFiles = 5,
}: PhotoUploaderProps) {
  const [previews, setPreviews] = useState<string[]>([]);

  async function handleFilesSelected(files: File[]) {
    const limited = files.slice(0, maxFiles - previews.length);

    // Create previews
    const newPreviews = limited.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);

    // Resize files
    const resized: File[] = [];
    for (const file of limited) {
      try {
        const blob = await resizeImage(file, 1200);
        resized.push(new File([blob], file.name, { type: 'image/jpeg' }));
      } catch {
        resized.push(file);
      }
    }

    onPhotosSelected(resized);
  }

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {previews.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-sage-light">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePreview(i)}
              className="absolute top-0.5 right-0.5 w-8 h-8 min-w-[44px] min-h-[44px] bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {previews.length < maxFiles && (
        <div>
          <PhotoSourcePicker
            accept="image/*"
            maxFiles={maxFiles - previews.length}
            maxWidth={1200}
            capture="environment"
            onFilesSelected={handleFilesSelected}
          />
          <p className="text-xs text-sage mt-1">
            Up to {maxFiles} photos. Images will be resized automatically.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/manage/PhotoUploader.tsx
git commit -m "feat: integrate PhotoSourcePicker into PhotoUploader"
```

---

### Task 8: Integrate into FileDropZone

**Files:**
- Modify: `src/components/ai-context/FileDropZone.tsx`

- [ ] **Step 1: Read the current FileDropZone**

Read `src/components/ai-context/FileDropZone.tsx` to understand the tab structure.

- [ ] **Step 2: Add Google Photos as a 4th tab**

Add imports at the top:

```typescript
import { isGooglePhotosConfigured } from '@/lib/google/picker';
import GooglePhotosSource from '@/components/photos/GooglePhotosSource';
```

Update the `Tab` type:

```typescript
type Tab = 'files' | 'url' | 'text' | 'google-photos';
```

Update the tabs array to conditionally include Google Photos:

```typescript
const tabs: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'url', label: 'URL' },
  { id: 'text', label: 'Text' },
  ...(isGooglePhotosConfigured() ? [{ id: 'google-photos' as Tab, label: 'Google Photos' }] : []),
];
```

Add the Google Photos tab content after the Text tab block:

```typescript
{/* Google Photos tab */}
{activeTab === 'google-photos' && (
  <GooglePhotosSource
    maxFiles={10}
    onFilesSelected={(files) => {
      const updated = [...selectedFiles, ...files];
      setSelectedFiles(updated);
      onFilesSelected(updated);
    }}
  />
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-context/FileDropZone.tsx
git commit -m "feat: add Google Photos tab to FileDropZone"
```

---

### Task 9: Integrate into AssetManager

**Files:**
- Modify: `src/components/admin/landing/AssetManager.tsx`

- [ ] **Step 1: Read the current AssetManager**

Read `src/components/admin/landing/AssetManager.tsx` to understand the image upload section.

- [ ] **Step 2: Replace the image file input with PhotoSourcePicker**

Add import:

```typescript
import PhotoSourcePicker from '@/components/photos/PhotoSourcePicker';
```

Replace the image upload section. Find the `<input ref={imageInputRef} type="file" accept="image/*">` and the "Add image" button. Replace them with:

```typescript
{!atLimit && (
  <PhotoSourcePicker
    accept="image/*"
    maxFiles={1}
    maxWidth={2000}
    multiple={false}
    onFilesSelected={async (files) => {
      if (files.length === 0) return;
      setUploadError(null);
      setUploadingImage(true);
      try {
        const file = files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', 'image');
        const { asset, error } = await uploadLandingAsset(formData);
        if (error || !asset) {
          setUploadError(error ?? 'Upload failed');
        } else {
          onAssetsChange([...assets, asset]);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploadingImage(false);
      }
    }}
  />
)}
```

Remove the now-unused `imageInputRef` and the hidden `<input>` for images. Keep the `docInputRef` and document upload logic unchanged.

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/landing/AssetManager.tsx
git commit -m "feat: integrate PhotoSourcePicker into AssetManager"
```

---

### Task 10: Integrate into OverlayEditor

**Files:**
- Modify: `src/components/manage/OverlayEditor.tsx`

- [ ] **Step 1: Read the current OverlayEditor**

Read `src/components/manage/OverlayEditor.tsx` to understand the image source section.

- [ ] **Step 2: Replace the file input with PhotoSourcePicker**

Add import:

```typescript
import PhotoSourcePicker from '@/components/photos/PhotoSourcePicker';
```

Replace the file upload `<input type="file">` section (the "Upload an image" block) with:

```typescript
<div>
  <label className="block text-xs text-sage mb-1">Upload an image</label>
  <PhotoSourcePicker
    accept="image/png,image/jpeg,image/webp"
    maxFiles={1}
    maxWidth={4000}
    multiple={false}
    onFilesSelected={(files) => {
      if (files.length === 0) return;
      const file = files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setImageUrl('');
    }}
  />
</div>
```

Keep the URL input section below it unchanged.

Remove the now-unused `handleFileUpload` function and the old `<input type="file">`.

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/manage/OverlayEditor.tsx
git commit -m "feat: integrate PhotoSourcePicker into OverlayEditor"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run smoke tests if available**

Run: `npm run test:e2e:smoke`
Expected: Smoke tests pass.

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: final cleanup for photo source picker feature"
```
