# Puck Editor Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable custom Puck fields (ImagePicker, IconPicker, LinkField), upgrade text components to richtext, and enhance HeaderBar and other components.

**Architecture:** Three custom Puck field components provide image picking (with upload/library/Google Photos), icon selection (Lucide + Heroicons), and smart link editing. These fields replace plain text fields across 14+ components. The existing `landing-assets` Supabase bucket and Google Photos Picker API popup flow are reused.

**Tech Stack:** Puck 0.21 (custom/external fields, resolveFields), React 18, Supabase Storage, lucide-react, @heroicons/react, react-colorful, TipTap (via Puck richtext)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/puck/fields/ImagePickerField.tsx` | Puck `external` field: browse library, upload, Google Photos, paste URL |
| `src/lib/puck/fields/IconPickerField.tsx` | Puck `custom` field: searchable grid of Lucide + Heroicons |
| `src/lib/puck/fields/LinkField.tsx` | Puck `custom` field: URL input, internal autocomplete, target toggle, color picker |
| `src/lib/puck/fields/ColorPickerField.tsx` | Small shared Puck `custom` field wrapping react-colorful with preset swatches |
| `src/lib/puck/fields/link-utils.ts` | `resolveLink()` helper + `LinkValue` type for backwards-compatible link rendering |
| `src/lib/puck/icons/icon-catalog.ts` | Lazy-loaded index of Lucide + Heroicons names for search |
| `src/lib/puck/icons/IconRenderer.tsx` | Renders the correct icon from `{ set, name, style? }` via dynamic import |
| `src/lib/puck/fields/__tests__/ImagePickerField.test.tsx` | Tests for ImagePickerField |
| `src/lib/puck/fields/__tests__/IconPickerField.test.tsx` | Tests for IconPickerField |
| `src/lib/puck/fields/__tests__/LinkField.test.tsx` | Tests for LinkField |
| `src/lib/puck/fields/__tests__/ColorPickerField.test.tsx` | Tests for ColorPickerField |
| `src/lib/puck/fields/__tests__/link-utils.test.ts` | Tests for resolveLink helper |
| `src/lib/puck/icons/__tests__/IconRenderer.test.tsx` | Tests for IconRenderer |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/puck/types.ts` | Add `LinkValue`, `IconValue` types; update component prop interfaces |
| `src/lib/puck/config.ts` | Swap text fields for ImagePickerField, LinkField; add richtext fields |
| `src/lib/puck/chrome-config.ts` | Swap text fields for LinkField; enhance HeaderBar fields with resolveFields |
| `src/lib/puck/components/page/Hero.tsx` | Accept `IconValue` for new icon prop; use `resolveLink` for ctaHref |
| `src/lib/puck/components/page/ImageBlock.tsx` | Use `resolveLink` for linkHref |
| `src/lib/puck/components/page/Card.tsx` | Accept `IconValue` for icon; use `resolveLink`; render richtext for text |
| `src/lib/puck/components/page/RichText.tsx` | Render HTML string (richtext output) instead of markdown |
| `src/lib/puck/components/page/ButtonGroup.tsx` | Use `resolveLink` for button hrefs |
| `src/lib/puck/components/page/LinkList.tsx` | Use `resolveLink` for item URLs |
| `src/lib/puck/components/page/Testimonial.tsx` | (no render changes — image field swap is config-only) |
| `src/lib/puck/components/page/Gallery.tsx` | (no render changes — image field swap is config-only) |
| `src/lib/puck/components/page/Section.tsx` | (no render changes — image field swap is config-only) |
| `src/lib/puck/components/chrome/HeaderBar.tsx` | Add logo, icon, typography, links rendering |
| `src/lib/puck/components/chrome/AnnouncementBar.tsx` | Use `resolveLink` for linkUrl; render richtext for text |
| `src/lib/puck/components/chrome/FooterColumns.tsx` | Use `resolveLink` for link URLs |
| `src/lib/puck/components/chrome/SimpleFooter.tsx` | Use `resolveLink` for link URLs |
| `src/lib/puck/components/page/__tests__/page-components.test.tsx` | Update tests for new prop shapes |
| `src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx` | Update tests for HeaderBar enhancements |
| `src/lib/puck/__tests__/config.test.ts` | Update component count if needed |
| `package.json` | Add `@heroicons/react`, `react-colorful` |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @heroicons/react and react-colorful**

```bash
npm install @heroicons/react react-colorful
```

- [ ] **Step 2: Verify installation**

```bash
npm ls @heroicons/react react-colorful
```

Expected: Both packages listed with versions

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @heroicons/react and react-colorful dependencies"
```

---

## Task 2: Add Shared Types (LinkValue, IconValue)

**Files:**
- Modify: `src/lib/puck/types.ts`

- [ ] **Step 1: Write tests for the new types**

Create `src/lib/puck/fields/__tests__/link-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveLink, type LinkValue } from '../link-utils';

describe('resolveLink', () => {
  it('resolves a plain string to LinkValue with defaults', () => {
    const result = resolveLink('https://example.com');
    expect(result).toEqual({ href: 'https://example.com', target: '_blank', color: undefined });
  });

  it('resolves a plain internal path string', () => {
    const result = resolveLink('/about');
    expect(result).toEqual({ href: '/about', target: undefined, color: undefined });
  });

  it('passes through a LinkValue object', () => {
    const input: LinkValue = { href: '/contact', target: '_blank', color: '#ff0000' };
    const result = resolveLink(input);
    expect(result).toEqual(input);
  });

  it('resolves empty string', () => {
    const result = resolveLink('');
    expect(result).toEqual({ href: '', target: undefined, color: undefined });
  });

  it('resolves undefined to empty href', () => {
    const result = resolveLink(undefined);
    expect(result).toEqual({ href: '', target: undefined, color: undefined });
  });

  it('resolves a LinkValue without optional fields', () => {
    const result = resolveLink({ href: 'https://example.com' });
    expect(result).toEqual({ href: 'https://example.com', target: undefined, color: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/fields/__tests__/link-utils.test.ts --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Create link-utils.ts with LinkValue type and resolveLink helper**

Create `src/lib/puck/fields/link-utils.ts`:

```typescript
/** A link value that can be stored as a string (legacy) or object (new) */
export interface LinkValue {
  href: string;
  target?: '_blank';
  color?: string;
}

/** Icon value stored in Puck data */
export interface IconValue {
  set: 'lucide' | 'heroicons';
  name: string;
  style?: 'outline' | 'solid';
}

/**
 * Normalize a link field value to a LinkValue object.
 * Handles backwards compatibility: plain strings become { href }.
 * External URLs (http/https) default to target="_blank".
 */
export function resolveLink(value: string | LinkValue | undefined): LinkValue {
  if (!value) {
    return { href: '', target: undefined, color: undefined };
  }
  if (typeof value === 'string') {
    const isExternal = value.startsWith('http');
    return {
      href: value,
      target: isExternal ? '_blank' : undefined,
      color: undefined,
    };
  }
  return {
    href: value.href,
    target: value.target ?? undefined,
    color: value.color ?? undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/fields/__tests__/link-utils.test.ts --run
```

Expected: PASS — all 6 tests pass

- [ ] **Step 5: Add IconValue and LinkValue to types.ts**

Add to `src/lib/puck/types.ts` after the existing imports:

```typescript
// Re-export field value types for component use
export type { LinkValue, IconValue } from './fields/link-utils';
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/fields/link-utils.ts src/lib/puck/fields/__tests__/link-utils.test.ts src/lib/puck/types.ts
git commit -m "feat: add LinkValue/IconValue types and resolveLink helper"
```

---

## Task 3: ColorPickerField

**Files:**
- Create: `src/lib/puck/fields/ColorPickerField.tsx`
- Create: `src/lib/puck/fields/__tests__/ColorPickerField.test.tsx`

- [ ] **Step 1: Write tests for ColorPickerField**

Create `src/lib/puck/fields/__tests__/ColorPickerField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPickerField, COLOR_PRESETS } from '../ColorPickerField';

describe('ColorPickerField', () => {
  it('renders the current color swatch', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ColorPickerField value="#ff0000" onChange={onChange} label="Link Color" />
    );
    const swatch = container.querySelector('[data-testid="color-swatch"]') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('renders preset swatches', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    const presets = screen.getAllByRole('button', { name: /preset/i });
    expect(presets.length).toBe(COLOR_PRESETS.length);
  });

  it('calls onChange when a preset is clicked', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    const presets = screen.getAllByRole('button', { name: /preset/i });
    fireEvent.click(presets[0]);
    expect(onChange).toHaveBeenCalledWith(COLOR_PRESETS[0].value);
  });

  it('renders a clear button when value is set', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="#ff0000" onChange={onChange} label="Color" />);
    const clear = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('does not render clear button when value is empty', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="" onChange={onChange} label="Color" />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/fields/__tests__/ColorPickerField.test.tsx --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ColorPickerField**

Create `src/lib/puck/fields/ColorPickerField.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export const COLOR_PRESETS = [
  { label: 'Primary', value: 'var(--color-primary)' },
  { label: 'Primary Dark', value: 'var(--color-primary-dark)' },
  { label: 'Accent', value: 'var(--color-accent)' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Black', value: '#000000' },
];

interface ColorPickerFieldProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
}

export function ColorPickerField({ value, onChange, label }: ColorPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const displayColor = value || '#000000';
  const isHex = displayColor.startsWith('#');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="color-swatch"
          className="h-8 w-8 rounded border border-gray-300 cursor-pointer"
          style={{ backgroundColor: displayColor }}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`${label} color swatch`}
        />
        <span className="text-xs text-gray-600">{value || 'Default'}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-gray-400 hover:text-gray-600"
            aria-label="Clear color"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="space-y-2">
          {isHex && (
            <HexColorPicker color={displayColor} onChange={onChange} />
          )}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">#</span>
            <HexColorInput
              color={isHex ? displayColor : ''}
              onChange={onChange}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
              placeholder="hex"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChange(preset.value)}
                className="h-6 w-6 rounded border border-gray-200 hover:ring-2 hover:ring-blue-300"
                style={{ backgroundColor: preset.value }}
                aria-label={`preset ${preset.label}`}
                title={preset.label}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/fields/__tests__/ColorPickerField.test.tsx --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/fields/ColorPickerField.tsx src/lib/puck/fields/__tests__/ColorPickerField.test.tsx
git commit -m "feat: add ColorPickerField custom Puck field"
```

---

## Task 4: ImagePickerField

**Files:**
- Create: `src/lib/puck/fields/ImagePickerField.tsx`
- Create: `src/lib/puck/fields/__tests__/ImagePickerField.test.tsx`

- [ ] **Step 1: Write tests for ImagePickerField**

Create `src/lib/puck/fields/__tests__/ImagePickerField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImagePickerField } from '../ImagePickerField';

// Mock the config hook
vi.mock('@/lib/config/client', () => ({
  useConfig: () => ({ platformDomain: null }),
}));

// Mock the upload action
vi.mock('@/app/admin/landing/actions', () => ({
  uploadLandingAsset: vi.fn().mockResolvedValue({
    asset: { id: '1', publicUrl: 'https://example.com/img.jpg', fileName: 'img.jpg' },
    error: null,
  }),
}));

// Mock resizeImage
vi.mock('@/lib/utils', () => ({
  resizeImage: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/jpeg' })),
}));

describe('ImagePickerField', () => {
  const mockFetchList = vi.fn().mockResolvedValue([]);

  it('renders current image thumbnail when value is set', () => {
    render(
      <ImagePickerField
        value="https://example.com/photo.jpg"
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });

  it('renders placeholder when no value', () => {
    render(
      <ImagePickerField
        value=""
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    expect(screen.getByText(/choose image/i)).toBeDefined();
  });

  it('opens modal on click', () => {
    render(
      <ImagePickerField
        value=""
        onChange={vi.fn()}
        fetchAssets={mockFetchList}
      />
    );
    fireEvent.click(screen.getByText(/choose image/i));
    expect(screen.getByText(/select image/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    render(
      <ImagePickerField
        value="https://example.com/photo.jpg"
        onChange={onChange}
        fetchAssets={mockFetchList}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/fields/__tests__/ImagePickerField.test.tsx --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ImagePickerField**

Create `src/lib/puck/fields/ImagePickerField.tsx`:

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { resizeImage } from '@/lib/utils';
import { uploadLandingAsset } from '@/app/admin/landing/actions';
import { useConfig } from '@/lib/config/client';
import { isGooglePhotosConfigured } from '@/lib/google/picker';

type Tab = 'library' | 'upload' | 'google-photos' | 'url';

interface AssetItem {
  id: string;
  publicUrl: string;
  fileName: string;
}

interface ImagePickerFieldProps {
  value: string;
  onChange: (url: string) => void;
  fetchAssets: () => Promise<AssetItem[]>;
}

export function ImagePickerField({ value, onChange, fetchAssets }: ImagePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-1">
      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Selected"
            className="w-full h-24 object-cover rounded border border-gray-200 cursor-pointer"
            onClick={() => setIsOpen(true)}
          />
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="bg-white/90 rounded px-1.5 py-0.5 text-xs text-gray-700 hover:bg-white shadow-sm"
              aria-label="Change image"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="bg-white/90 rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-white shadow-sm"
              aria-label="Clear image"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full h-20 rounded border-2 border-dashed border-gray-300 hover:border-blue-400 flex items-center justify-center text-xs text-gray-500 hover:text-blue-600 transition-colors"
        >
          Choose Image
        </button>
      )}

      {isOpen && (
        <ImagePickerModal
          onSelect={(url) => { onChange(url); setIsOpen(false); }}
          onClose={() => setIsOpen(false)}
          fetchAssets={fetchAssets}
        />
      )}
    </div>
  );
}

function ImagePickerModal({
  onSelect,
  onClose,
  fetchAssets,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
  fetchAssets: () => Promise<AssetItem[]>;
}) {
  const config = useConfig();
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showGooglePhotos = isGooglePhotosConfigured();

  // Load assets when library tab is shown
  const loadAssets = useCallback(async () => {
    if (loaded) return;
    const items = await fetchAssets();
    setAssets(items);
    setLoaded(true);
  }, [fetchAssets, loaded]);

  if (activeTab === 'library' && !loaded) {
    loadAssets();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const blob = await resizeImage(file, 2000);
      const resized = new File([blob], file.name, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', resized);
      formData.append('category', 'image');
      const { asset, error } = await uploadLandingAsset(formData);
      if (error || !asset) {
        setUploadError(error ?? 'Upload failed');
      } else {
        onSelect(asset.publicUrl);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleGooglePhotos() {
    setGoogleStatus('loading');

    const getPickerUrl = (maxFiles: number) => {
      const platformDomain = config.platformDomain;
      if (platformDomain && platformDomain !== 'localhost') {
        const protocol = platformDomain.includes('localhost') ? 'http' : 'https';
        return `${protocol}://${platformDomain}/google-photos-picker?maxFiles=${maxFiles}`;
      }
      return `/google-photos-picker?maxFiles=${maxFiles}`;
    };

    const popup = window.open(getPickerUrl(1), 'google-photos-picker', 'width=900,height=600,scrollbars=yes');
    if (!popup) {
      setGoogleStatus('error');
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'google-photos-picked') return;
      window.removeEventListener('message', handleMessage);

      const results = event.data.results || [];
      if (results.length === 0) {
        setGoogleStatus('idle');
        return;
      }

      // Download via proxy and upload to our storage
      try {
        const result = results[0];
        const response = await fetch('/api/photos/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url, token: result.token }),
        });
        if (!response.ok) throw new Error('Failed to download photo');

        const blob = await response.blob();
        const resized = await resizeImage(new File([blob], result.name, { type: result.mimeType }), 2000);
        const formData = new FormData();
        formData.append('file', new File([resized], result.name, { type: 'image/jpeg' }));
        formData.append('category', 'image');
        const { asset, error } = await uploadLandingAsset(formData);
        if (error || !asset) throw new Error(error ?? 'Upload failed');
        onSelect(asset.publicUrl);
      } catch {
        setGoogleStatus('error');
      }
    };

    window.addEventListener('message', handleMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setGoogleStatus((s) => (s === 'loading' ? 'idle' : s));
      }
    }, 500);
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'library', label: 'Library', show: true },
    { id: 'upload', label: 'Upload', show: true },
    { id: 'google-photos', label: 'Google Photos', show: showGooglePhotos },
    { id: 'url', label: 'URL', show: true },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Select Image</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg" aria-label="Close">&times;</button>
        </div>

        <div className="flex border-b border-gray-200 px-4">
          {tabs.filter(t => t.show).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs py-2 px-3 border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-blue-500 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' && (
            assets.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No images uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset.publicUrl)}
                    className="group relative rounded overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                  >
                    <img src={asset.publicUrl} alt={asset.fileName} className="w-full h-20 object-cover" />
                    <div className="px-1 py-0.5 text-xs text-gray-600 truncate bg-white">{asset.fileName}</div>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {uploadError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 w-full">{uploadError}</div>}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-blue-600 border border-blue-300 rounded-lg px-6 py-3 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Choose Image File'}
              </button>
              <p className="text-xs text-gray-400">Image will be resized to max 2000px width.</p>
            </div>
          )}

          {activeTab === 'google-photos' && (
            <div className="flex flex-col items-center gap-3 py-6">
              {googleStatus === 'idle' && (
                <button type="button" onClick={handleGooglePhotos} className="btn-primary">
                  Browse Google Photos
                </button>
              )}
              {googleStatus === 'loading' && <p className="text-sm text-gray-600">Connecting to Google Photos...</p>}
              {googleStatus === 'error' && (
                <div>
                  <p className="text-sm text-red-600 mb-2">Failed to import photo.</p>
                  <button type="button" onClick={handleGooglePhotos} className="btn-secondary text-sm">Try Again</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="flex flex-col gap-3 py-4">
              <label className="text-xs font-medium text-gray-700">Image URL</label>
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { onSelect(externalUrl.trim()); }}
                disabled={!externalUrl.trim()}
                className="self-start text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                Use URL
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/fields/__tests__/ImagePickerField.test.tsx --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/fields/ImagePickerField.tsx src/lib/puck/fields/__tests__/ImagePickerField.test.tsx
git commit -m "feat: add ImagePickerField for Puck editor"
```

---

## Task 5: IconRenderer and Icon Catalog

**Files:**
- Create: `src/lib/puck/icons/icon-catalog.ts`
- Create: `src/lib/puck/icons/IconRenderer.tsx`
- Create: `src/lib/puck/icons/__tests__/IconRenderer.test.tsx`

- [ ] **Step 1: Write tests for IconRenderer**

Create `src/lib/puck/icons/__tests__/IconRenderer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { IconRenderer } from '../IconRenderer';

// Mock lucide-react with a simple component
vi.mock('lucide-react', () => ({
  icons: {
    Bird: (props: any) => <svg data-testid="lucide-bird" {...props} />,
    MapPin: (props: any) => <svg data-testid="lucide-map-pin" {...props} />,
  },
}));

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-outline" {...props} />,
  MapPinIcon: (props: any) => <svg data-testid="hero-map-pin-outline" {...props} />,
}));

vi.mock('@heroicons/react/24/solid', () => ({
  BirdIcon: (props: any) => <svg data-testid="hero-bird-solid" {...props} />,
  MapPinIcon: (props: any) => <svg data-testid="hero-map-pin-solid" {...props} />,
}));

describe('IconRenderer', () => {
  it('renders nothing when icon is undefined', () => {
    const { container } = render(<IconRenderer icon={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a lucide icon', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="lucide-bird"]')).not.toBeNull();
    });
  });

  it('passes className and size props', async () => {
    const { container } = render(
      <IconRenderer icon={{ set: 'lucide', name: 'Bird' }} className="text-red-500" size={24} />
    );
    await waitFor(() => {
      const svg = container.querySelector('[data-testid="lucide-bird"]');
      expect(svg?.getAttribute('class')).toContain('text-red-500');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/icons/__tests__/IconRenderer.test.tsx --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Create icon-catalog.ts**

Create `src/lib/puck/icons/icon-catalog.ts`:

```typescript
export interface IconEntry {
  set: 'lucide' | 'heroicons';
  name: string;
  searchTerms: string; // lowercase, space-separated for search
}

let lucideEntries: IconEntry[] | null = null;
let heroiconEntries: IconEntry[] | null = null;

/** Lazily load and cache the Lucide icon name list */
export async function getLucideIcons(): Promise<IconEntry[]> {
  if (lucideEntries) return lucideEntries;
  const { icons } = await import('lucide-react');
  lucideEntries = Object.keys(icons).map((name) => ({
    set: 'lucide' as const,
    name,
    searchTerms: name.toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
  }));
  return lucideEntries;
}

/** Lazily load and cache the Heroicons name list */
export async function getHeroicons(): Promise<IconEntry[]> {
  if (heroiconEntries) return heroiconEntries;
  const outlineMod = await import('@heroicons/react/24/outline');
  heroiconEntries = Object.keys(outlineMod)
    .filter((name) => name.endsWith('Icon'))
    .map((name) => ({
      set: 'heroicons' as const,
      name: name.replace(/Icon$/, ''),
      searchTerms: name.replace(/Icon$/, '').toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
    }));
  return heroiconEntries;
}

/** Search icons by query string across one or both sets */
export async function searchIcons(
  query: string,
  set?: 'lucide' | 'heroicons'
): Promise<IconEntry[]> {
  const q = query.toLowerCase().trim();
  const results: IconEntry[] = [];

  if (!set || set === 'lucide') {
    const lucide = await getLucideIcons();
    results.push(...lucide.filter((e) => e.searchTerms.includes(q)));
  }
  if (!set || set === 'heroicons') {
    const heroicons = await getHeroicons();
    results.push(...heroicons.filter((e) => e.searchTerms.includes(q)));
  }

  return results.slice(0, 200); // Cap results for performance
}
```

- [ ] **Step 4: Create IconRenderer.tsx**

Create `src/lib/puck/icons/IconRenderer.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { IconValue } from '../fields/link-utils';
import type { ComponentType, SVGProps } from 'react';

interface IconRendererProps {
  icon: IconValue | undefined;
  size?: number;
  className?: string;
}

export function IconRenderer({ icon, size = 20, className }: IconRendererProps) {
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    if (!icon) {
      setIconComponent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        let Component: ComponentType<SVGProps<SVGSVGElement>> | undefined;

        if (icon!.set === 'lucide') {
          const mod = await import('lucide-react');
          Component = (mod.icons as Record<string, ComponentType<any>>)[icon!.name];
        } else if (icon!.set === 'heroicons') {
          const style = icon!.style || 'outline';
          if (style === 'solid') {
            const mod = await import('@heroicons/react/24/solid');
            Component = (mod as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          } else {
            const mod = await import('@heroicons/react/24/outline');
            Component = (mod as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          }
        }

        if (!cancelled && Component) {
          setIconComponent(() => Component!);
        }
      } catch {
        // Icon not found — render nothing
      }
    }

    load();
    return () => { cancelled = true; };
  }, [icon?.set, icon?.name, icon?.style]);

  if (!icon || !IconComponent) return null;

  return <IconComponent width={size} height={size} className={className} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/icons/__tests__/IconRenderer.test.tsx --run
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/icons/icon-catalog.ts src/lib/puck/icons/IconRenderer.tsx src/lib/puck/icons/__tests__/IconRenderer.test.tsx
git commit -m "feat: add IconRenderer and icon catalog for Puck editor"
```

---

## Task 6: IconPickerField

**Files:**
- Create: `src/lib/puck/fields/IconPickerField.tsx`
- Create: `src/lib/puck/fields/__tests__/IconPickerField.test.tsx`

- [ ] **Step 1: Write tests for IconPickerField**

Create `src/lib/puck/fields/__tests__/IconPickerField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconPickerField } from '../IconPickerField';

// Mock icon catalog
vi.mock('../../icons/icon-catalog', () => ({
  searchIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'lucide', name: 'MapPin', searchTerms: 'map pin' },
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
  getLucideIcons: vi.fn().mockResolvedValue([
    { set: 'lucide', name: 'Bird', searchTerms: 'bird' },
    { set: 'lucide', name: 'MapPin', searchTerms: 'map pin' },
  ]),
  getHeroicons: vi.fn().mockResolvedValue([
    { set: 'heroicons', name: 'Star', searchTerms: 'star' },
  ]),
}));

// Mock IconRenderer
vi.mock('../../icons/IconRenderer', () => ({
  IconRenderer: ({ icon }: any) => icon ? <span data-testid="icon-preview">{icon.name}</span> : null,
}));

describe('IconPickerField', () => {
  it('renders "No icon" when value is undefined', () => {
    render(<IconPickerField value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/no icon/i)).toBeDefined();
  });

  it('renders icon name when value is set', () => {
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Bird')).toBeDefined();
  });

  it('opens picker on click', () => {
    render(<IconPickerField value={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText(/no icon/i));
    expect(screen.getByPlaceholderText(/search icons/i)).toBeDefined();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    render(
      <IconPickerField
        value={{ set: 'lucide', name: 'Bird' }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/fields/__tests__/IconPickerField.test.tsx --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement IconPickerField**

Create `src/lib/puck/fields/IconPickerField.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IconValue } from './link-utils';
import { IconRenderer } from '../icons/IconRenderer';
import { searchIcons, getLucideIcons, getHeroicons, type IconEntry } from '../icons/icon-catalog';

interface IconPickerFieldProps {
  value: IconValue | undefined;
  onChange: (value: IconValue | undefined) => void;
}

type IconSet = 'all' | 'lucide' | 'heroicons';

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [iconSet, setIconSet] = useState<IconSet>('all');
  const [results, setResults] = useState<IconEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadIcons = useCallback(async () => {
    setLoading(true);
    try {
      if (query) {
        const set = iconSet === 'all' ? undefined : iconSet;
        setResults(await searchIcons(query, set));
      } else {
        // Load first batch of each set
        const set = iconSet === 'all' ? undefined : iconSet;
        if (!set || set === 'lucide') {
          const lucide = await getLucideIcons();
          if (!set) {
            const heroicons = await getHeroicons();
            setResults([...lucide.slice(0, 100), ...heroicons.slice(0, 100)]);
          } else {
            setResults(lucide.slice(0, 200));
          }
        } else {
          const heroicons = await getHeroicons();
          setResults(heroicons.slice(0, 200));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [query, iconSet]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(loadIcons, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, loadIcons, query]);

  function handleSelect(entry: IconEntry) {
    onChange({
      set: entry.set,
      name: entry.name,
      style: entry.set === 'heroicons' ? 'outline' : undefined,
    });
    setIsOpen(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-xs hover:border-blue-400 transition-colors w-full"
        >
          {value ? (
            <>
              <IconRenderer icon={value} size={16} />
              <span>{value.name}</span>
              <span className="text-gray-400 ml-auto">{value.set}</span>
            </>
          ) : (
            <span className="text-gray-400">No icon</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Clear icon"
          >
            Clear
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-lg p-3 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
            autoFocus
          />

          <div className="flex gap-1">
            {(['all', 'lucide', 'heroicons'] as IconSet[]).map((set) => (
              <button
                key={set}
                type="button"
                onClick={() => setIconSet(set)}
                className={`text-xs px-2 py-0.5 rounded ${
                  iconSet === set ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {set === 'all' ? 'All' : set === 'lucide' ? 'Lucide' : 'Heroicons'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="col-span-8 text-center text-xs text-gray-400 py-4">Loading...</div>
            ) : results.length === 0 ? (
              <div className="col-span-8 text-center text-xs text-gray-400 py-4">No icons found</div>
            ) : (
              results.map((entry) => (
                <button
                  key={`${entry.set}-${entry.name}`}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="flex items-center justify-center h-8 w-8 rounded hover:bg-blue-50 transition-colors"
                  title={`${entry.name} (${entry.set})`}
                >
                  <IconRenderer
                    icon={{ set: entry.set, name: entry.name, style: entry.set === 'heroicons' ? 'outline' : undefined }}
                    size={16}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/fields/__tests__/IconPickerField.test.tsx --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/fields/IconPickerField.tsx src/lib/puck/fields/__tests__/IconPickerField.test.tsx
git commit -m "feat: add IconPickerField for Puck editor"
```

---

## Task 7: LinkField

**Files:**
- Create: `src/lib/puck/fields/LinkField.tsx`
- Create: `src/lib/puck/fields/__tests__/LinkField.test.tsx`

- [ ] **Step 1: Write tests for LinkField**

Create `src/lib/puck/fields/__tests__/LinkField.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkField } from '../LinkField';

// Mock ColorPickerField
vi.mock('../ColorPickerField', () => ({
  ColorPickerField: ({ value, onChange, label }: any) => (
    <div data-testid="color-picker">
      <span>{label}</span>
      <button onClick={() => onChange('#ff0000')}>set-color</button>
    </div>
  ),
}));

describe('LinkField', () => {
  it('renders href when value is a string', () => {
    render(<LinkField value="/about" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('/about')).toBeDefined();
  });

  it('renders href when value is a LinkValue object', () => {
    render(
      <LinkField value={{ href: '/contact', target: '_blank', color: '#ff0000' }} onChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue('/contact')).toBeDefined();
  });

  it('renders placeholder when value is empty', () => {
    render(<LinkField value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/url/i)).toBeDefined();
  });

  it('calls onChange with LinkValue when href changes', () => {
    const onChange = vi.fn();
    render(<LinkField value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/url/i);
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.com' })
    );
  });

  it('shows target toggle', () => {
    render(<LinkField value={{ href: '/about' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/new tab/i)).toBeDefined();
  });

  it('shows color picker', () => {
    render(<LinkField value={{ href: '/about' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('color-picker')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/puck/fields/__tests__/LinkField.test.tsx --run
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement LinkField**

Create `src/lib/puck/fields/LinkField.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { LinkValue } from './link-utils';
import { resolveLink } from './link-utils';
import { ColorPickerField } from './ColorPickerField';

interface LinkFieldProps {
  value: string | LinkValue | undefined;
  onChange: (value: LinkValue) => void;
}

export function LinkField({ value, onChange }: LinkFieldProps) {
  const resolved = resolveLink(value);
  const [href, setHref] = useState(resolved.href);
  const [target, setTarget] = useState<'_blank' | undefined>(resolved.target);
  const [color, setColor] = useState<string | undefined>(resolved.color);

  // Sync local state when value changes externally
  useEffect(() => {
    const r = resolveLink(value);
    setHref(r.href);
    setTarget(r.target);
    setColor(r.color);
  }, [value]);

  function emitChange(updates: Partial<LinkValue>) {
    const next: LinkValue = {
      href: updates.href ?? href,
      target: updates.target !== undefined ? updates.target : target,
      color: updates.color !== undefined ? updates.color : color,
    };
    onChange(next);
  }

  function handleHrefBlur() {
    emitChange({ href });
  }

  function handleTargetToggle() {
    const next = target === '_blank' ? undefined : '_blank';
    setTarget(next);
    emitChange({ target: next });
  }

  function handleColorChange(c: string | undefined) {
    setColor(c);
    emitChange({ color: c });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onBlur={handleHrefBlur}
        placeholder="URL (e.g. /about or https://...)"
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={target === '_blank'}
            onChange={handleTargetToggle}
            className="rounded border-gray-300"
            aria-label="Open in new tab"
          />
          New tab
        </label>
      </div>

      <ColorPickerField
        value={color}
        onChange={handleColorChange}
        label="Link Color"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- src/lib/puck/fields/__tests__/LinkField.test.tsx --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/fields/LinkField.tsx src/lib/puck/fields/__tests__/LinkField.test.tsx
git commit -m "feat: add LinkField custom Puck field"
```

---

## Task 8: Create Puck Field Factories

Build the helper functions that produce Puck-compatible field config objects from our custom field components. These are what get used in `config.ts` and `chrome-config.ts`.

**Files:**
- Create: `src/lib/puck/fields/index.ts`

- [ ] **Step 1: Create field factory functions**

Create `src/lib/puck/fields/index.ts`:

```typescript
import type { ComponentType } from 'react';
import { ImagePickerField } from './ImagePickerField';
import { IconPickerField } from './IconPickerField';
import { LinkField } from './LinkField';
import { ColorPickerField } from './ColorPickerField';

export type { LinkValue, IconValue } from './link-utils';
export { resolveLink } from './link-utils';
export { ImagePickerField } from './ImagePickerField';
export { IconPickerField } from './IconPickerField';
export { LinkField } from './LinkField';
export { ColorPickerField } from './ColorPickerField';

/**
 * Creates a Puck custom field config for an image picker.
 * @param label - Field label shown in the Puck sidebar
 * @param fetchAssets - Async function that returns the list of available assets
 */
export function imagePickerField(label: string, fetchAssets: () => Promise<Array<{ id: string; publicUrl: string; fileName: string }>>) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: string; onChange: (val: string) => void }) => (
      <ImagePickerField value={value || ''} onChange={onChange} fetchAssets={fetchAssets} />
    ),
  };
}

/**
 * Creates a Puck custom field config for an icon picker.
 * @param label - Field label shown in the Puck sidebar
 */
export function iconPickerField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <IconPickerField value={value} onChange={onChange} />
    ),
  };
}

/**
 * Creates a Puck custom field config for a link field.
 * @param label - Field label shown in the Puck sidebar
 */
export function linkField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <LinkField value={value} onChange={onChange} />
    ),
  };
}

/**
 * Creates a Puck custom field config for a color picker.
 * @param label - Field label shown in the Puck sidebar
 */
export function colorPickerField(label: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <ColorPickerField value={value} onChange={onChange} label={label} />
    ),
  };
}
```

- [ ] **Step 2: Verify the module resolves**

```bash
npm run type-check 2>&1 | head -20
```

Expected: No errors related to `src/lib/puck/fields/index.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/puck/fields/index.ts
git commit -m "feat: add Puck field factory functions"
```

---

## Task 9: Update Component Types

Update the TypeScript interfaces in `types.ts` to support the new field shapes.

**Files:**
- Modify: `src/lib/puck/types.ts`

- [ ] **Step 1: Update HeroProps, ImageBlockProps, CardProps, TestimonialProps, SectionProps, GalleryProps**

In `src/lib/puck/types.ts`, update the interfaces to use `LinkValue` and `IconValue` where applicable. The `LinkValue` and `IconValue` re-exports were already added in Task 2. Now update the component prop interfaces:

```typescript
// At the top, add the import (keep existing imports):
import type { LinkValue, IconValue } from './fields/link-utils';
```

Then update these interfaces:

```typescript
export interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
  overlay: 'primary' | 'dark' | 'none';
  ctaLabel: string;
  ctaHref: string | LinkValue;
  icon?: IconValue;
}

export interface ImageBlockProps {
  url: string;
  alt: string;
  caption: string;
  width: 'small' | 'medium' | 'full';
  linkHref: string | LinkValue;
}

export interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    href: string | LinkValue;
    style: 'primary' | 'outline';
    size: 'default' | 'large';
  }>;
}

export interface LinkListProps {
  items: Array<{
    label: string;
    url: string | LinkValue;
    description: string;
  }>;
  layout: 'inline' | 'stacked';
}

export interface CardProps {
  imageUrl: string;
  title: string;
  text: string;
  linkHref: string | LinkValue;
  linkLabel: string;
  icon?: IconValue;
}

export interface HeaderBarProps {
  layout: 'centered' | 'left-aligned';
  showTagline: boolean;
  backgroundColor: 'primary' | 'primary-dark' | 'surface' | 'default';
  logoUrl?: string;
  icon?: IconValue;
  iconPosition?: 'before-name' | 'after-name' | 'above-name';
  nameSize?: 'small' | 'medium' | 'large' | 'xl';
  nameWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  nameColor?: string;
  taglineSize?: 'small' | 'medium' | 'large' | 'xl';
  taglineWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  taglineColor?: string;
  links?: Array<{ label: string; href: string }>;
  linkColor?: string;
}

export interface AnnouncementBarProps {
  text: string;
  linkUrl: string | LinkValue;
  backgroundColor: 'primary' | 'accent' | 'surface';
}

export interface FooterColumnsProps {
  columns: Array<{
    title: string;
    links: Array<{ label: string; url: string | LinkValue }>;
  }>;
  showBranding: boolean;
  copyrightText: string;
}

export interface SimpleFooterProps {
  text: string;
  links: Array<{ label: string; url: string | LinkValue }>;
  showPoweredBy: boolean;
}
```

Note: `RichTextProps`, `TestimonialProps`, `GalleryProps`, `SectionProps` interfaces remain unchanged since their image URL fields stay as plain strings (the image picker stores a string URL), and the richtext upgrade doesn't change the prop type (still `string`, but now HTML instead of markdown).

- [ ] **Step 2: Run type check**

```bash
npm run type-check 2>&1 | head -40
```

Expected: Type errors in component files that still use `string` where `string | LinkValue` is now expected. This is expected — we'll fix these in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/puck/types.ts
git commit -m "feat: update Puck component types for LinkValue, IconValue, and HeaderBar enhancements"
```

---

## Task 10: Update Page Component Render Functions

Update the page component render functions to handle the new `LinkValue` type using `resolveLink()`.

**Files:**
- Modify: `src/lib/puck/components/page/Hero.tsx`
- Modify: `src/lib/puck/components/page/ImageBlock.tsx`
- Modify: `src/lib/puck/components/page/Card.tsx`
- Modify: `src/lib/puck/components/page/ButtonGroup.tsx`
- Modify: `src/lib/puck/components/page/LinkList.tsx`
- Modify: `src/lib/puck/components/page/RichText.tsx`

- [ ] **Step 1: Update Hero.tsx**

Replace the contents of `src/lib/puck/components/page/Hero.tsx`:

```tsx
import Link from 'next/link';
import type { HeroProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';

const overlayClasses = {
  primary: 'bg-[var(--color-primary)]/70',
  dark: 'bg-black/60',
  none: '',
};

export function Hero({ title, subtitle, backgroundImageUrl, overlay, ctaLabel, ctaHref, icon }: HeroProps) {
  const cta = resolveLink(ctaHref);
  return (
    <section
      className="relative flex min-h-[300px] items-center justify-center"
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {!backgroundImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]" />
      )}
      {overlay !== 'none' && (
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      )}
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center text-white">
        {icon && (
          <div className="mb-4 flex justify-center">
            <IconRenderer icon={icon} size={48} className="text-white" />
          </div>
        )}
        {title && <h1 className="text-4xl font-bold md:text-5xl">{title}</h1>}
        {subtitle && <p className="mt-4 text-lg opacity-90 md:text-xl">{subtitle}</p>}
        {ctaLabel && cta.href && (
          <Link
            href={cta.href}
            target={cta.target}
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-[var(--color-primary-dark)] transition hover:bg-opacity-90"
            style={cta.color ? { color: cta.color } : undefined}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update ImageBlock.tsx**

Replace the contents of `src/lib/puck/components/page/ImageBlock.tsx`:

```tsx
import type { ImageBlockProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

const widthClasses = {
  small: 'max-w-sm',
  medium: 'max-w-2xl',
  full: 'max-w-full',
};

export function ImageBlock({ url, alt, caption, width, linkHref }: ImageBlockProps) {
  const link = resolveLink(linkHref);
  const img = (
    <div className={`mx-auto px-4 py-4 ${widthClasses[width]}`}>
      <img src={url} alt={alt} className="h-auto w-full rounded-lg" loading="lazy" />
      {caption && <p className="mt-2 text-center text-sm text-gray-600">{caption}</p>}
    </div>
  );
  if (link.href) {
    return (
      <a
        href={link.href}
        target={link.target}
        rel="noopener noreferrer"
        style={link.color ? { color: link.color } : undefined}
      >
        {img}
      </a>
    );
  }
  return img;
}
```

- [ ] **Step 3: Update Card.tsx**

Replace the contents of `src/lib/puck/components/page/Card.tsx`:

```tsx
import type { CardProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';

export function Card({ imageUrl, title, text, linkHref, linkLabel, icon }: CardProps) {
  const link = resolveLink(linkHref);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      {imageUrl && <img src={imageUrl} alt={title} className="h-48 w-full object-cover" loading="lazy" />}
      <div className="p-4">
        {icon && (
          <div className="mb-2">
            <IconRenderer icon={icon} size={24} className="text-[var(--color-primary)]" />
          </div>
        )}
        {title && <h3 className="text-lg font-semibold text-[var(--color-primary-dark)]">{title}</h3>}
        {text && <p className="mt-2 text-sm text-gray-600">{text}</p>}
        {link.href && linkLabel && (
          <a
            href={link.href}
            target={link.target}
            className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
            style={link.color ? { color: link.color } : undefined}
          >
            {linkLabel} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update ButtonGroup.tsx**

Replace the contents of `src/lib/puck/components/page/ButtonGroup.tsx`:

```tsx
import Link from 'next/link';
import type { ButtonGroupProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function ButtonGroup({ buttons }: ButtonGroupProps) {
  if (!buttons?.length) return <></>;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
      {buttons.map((btn, i) => {
        const link = resolveLink(btn.href);
        const isExternal = link.target === '_blank';
        const className =
          btn.style === 'primary'
            ? `inline-block rounded-lg px-6 py-3 font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition${btn.size === 'large' ? ' px-8 py-4 text-lg' : ''}`
            : `inline-block rounded-lg px-6 py-3 font-semibold border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition${btn.size === 'large' ? ' px-8 py-4 text-lg' : ''}`;
        if (isExternal) {
          return (
            <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
              {btn.label}
            </a>
          );
        }
        return (
          <Link key={i} href={link.href} className={className}>
            {btn.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Update LinkList.tsx**

Replace the contents of `src/lib/puck/components/page/LinkList.tsx`:

```tsx
import type { LinkListProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function LinkList({ items, layout }: LinkListProps) {
  if (!items?.length) return <></>;
  const containerClass =
    layout === 'inline'
      ? 'flex flex-wrap items-center justify-center gap-4'
      : 'flex flex-col gap-3';
  return (
    <div className={`mx-auto max-w-2xl px-4 py-4 ${containerClass}`}>
      {items.map((item, i) => {
        const link = resolveLink(item.url);
        return (
          <a
            key={i}
            href={link.href}
            target={link.target}
            rel="noopener noreferrer"
            className="group block rounded-lg border border-gray-200 p-3 transition hover:border-[var(--color-primary)] hover:shadow-sm"
            style={link.color ? { color: link.color } : undefined}
          >
            <span className="font-medium text-[var(--color-primary)] group-hover:underline">{item.label}</span>
            {item.description && (
              <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Update RichText.tsx to render HTML (richtext output)**

Replace the contents of `src/lib/puck/components/page/RichText.tsx`:

```tsx
import type { RichTextProps } from '../../types';

export function RichText({ content, alignment, columns }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';

  // Detect if content is HTML (from richtext field) or plain text/markdown
  const isHtml = content.startsWith('<') || content.includes('<p>') || content.includes('<h');

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className="prose prose-lg max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]">
        {isHtml ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          // Lazy-load ReactMarkdown only for legacy markdown content
          <MarkdownContent content={content} />
        )}
      </div>
    </div>
  );
}

/** Wrapper for legacy markdown content — keeps ReactMarkdown import lazy */
function MarkdownContent({ content }: { content: string }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactMarkdown = require('react-markdown').default;
  const remarkGfm = require('remark-gfm').default;
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}
```

- [ ] **Step 7: Run tests to verify components still work**

```bash
npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx --run
```

Expected: Most tests PASS. Some may need minor updates for new optional props — fix any failures.

- [ ] **Step 8: Commit**

```bash
git add src/lib/puck/components/page/Hero.tsx src/lib/puck/components/page/ImageBlock.tsx src/lib/puck/components/page/Card.tsx src/lib/puck/components/page/ButtonGroup.tsx src/lib/puck/components/page/LinkList.tsx src/lib/puck/components/page/RichText.tsx
git commit -m "feat: update page components for LinkValue, IconValue, and richtext rendering"
```

---

## Task 11: Update Chrome Component Render Functions

**Files:**
- Modify: `src/lib/puck/components/chrome/HeaderBar.tsx`
- Modify: `src/lib/puck/components/chrome/AnnouncementBar.tsx`
- Modify: `src/lib/puck/components/chrome/FooterColumns.tsx`
- Modify: `src/lib/puck/components/chrome/SimpleFooter.tsx`

- [ ] **Step 1: Update HeaderBar.tsx with full enhancements**

Replace the contents of `src/lib/puck/components/chrome/HeaderBar.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useConfig } from '@/lib/config/client';
import type { HeaderBarProps } from '../../types';
import { IconRenderer } from '../../icons/IconRenderer';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  'primary-dark': 'bg-[var(--color-primary-dark)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
  default: 'bg-white text-gray-900 border-b border-gray-200',
};

const sizeClasses = {
  small: 'text-sm',
  medium: 'text-lg',
  large: 'text-xl',
  xl: 'text-2xl',
};

const weightClasses = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function HeaderBar({
  layout,
  showTagline,
  backgroundColor,
  logoUrl,
  icon,
  iconPosition = 'before-name',
  nameSize = 'medium',
  nameWeight = 'bold',
  nameColor,
  taglineSize = 'small',
  taglineWeight = 'normal',
  taglineColor,
  links,
  linkColor,
}: HeaderBarProps) {
  const config = useConfig();
  const alignClass = layout === 'centered' ? 'text-center' : 'text-left';
  const displayLogo = logoUrl || config.logoUrl;

  const nameNode = (
    <span
      className={`${sizeClasses[nameSize]} ${weightClasses[nameWeight]}`}
      style={nameColor ? { color: nameColor } : undefined}
    >
      {config.siteName}
    </span>
  );

  const iconNode = icon ? <IconRenderer icon={icon} size={nameSize === 'xl' ? 28 : nameSize === 'large' ? 24 : 20} /> : null;

  return (
    <header className={`px-4 py-3 ${bgClasses[backgroundColor]}`}>
      <div className={`mx-auto max-w-6xl ${alignClass}`}>
        <div className={layout === 'centered' ? 'flex flex-col items-center gap-1' : 'flex items-center justify-between'}>
          <Link href="/" className="inline-flex items-center gap-3">
            {displayLogo && <img src={displayLogo} alt={config.siteName} className="h-8 w-auto" />}
            {iconPosition === 'above-name' && iconNode && (
              <div className="flex flex-col items-center gap-1">
                {iconNode}
                {nameNode}
              </div>
            )}
            {iconPosition !== 'above-name' && (
              <>
                {iconPosition === 'before-name' && iconNode}
                {nameNode}
                {iconPosition === 'after-name' && iconNode}
              </>
            )}
          </Link>

          {links && links.length > 0 && (
            <nav className="flex items-center gap-4">
              {links.map((link, i) => (
                <Link
                  key={i}
                  href={link.href}
                  className="text-sm hover:underline"
                  style={linkColor ? { color: linkColor } : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {showTagline && config.tagline && (
          <p
            className={`mt-0.5 opacity-80 ${sizeClasses[taglineSize]} ${weightClasses[taglineWeight]}`}
            style={taglineColor ? { color: taglineColor } : undefined}
          >
            {config.tagline}
          </p>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Update AnnouncementBar.tsx**

Replace the contents of `src/lib/puck/components/chrome/AnnouncementBar.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { AnnouncementBarProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  accent: 'bg-[var(--color-accent)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
};

export function AnnouncementBar({ text, linkUrl, backgroundColor }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !text) return <></>;
  const link = resolveLink(linkUrl);
  const content = link.href ? (
    <a
      href={link.href}
      target={link.target}
      className="underline hover:no-underline"
      style={link.color ? { color: link.color } : undefined}
    >
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
  return (
    <div className={`relative px-4 py-2 text-center text-sm ${bgClasses[backgroundColor]}`}>
      {content}
      <button onClick={() => setDismissed(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
    </div>
  );
}
```

- [ ] **Step 3: Update FooterColumns.tsx**

Replace the contents of `src/lib/puck/components/chrome/FooterColumns.tsx`:

```tsx
'use client';
import { useConfig } from '@/lib/config/client';
import type { FooterColumnsProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function FooterColumns({ columns, showBranding, copyrightText }: FooterColumnsProps) {
  const config = useConfig();
  const gridClass = columns.length <= 2 ? 'md:grid-cols-2' : columns.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4';
  return (
    <footer className="bg-[var(--color-primary-dark)] px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        {showBranding && (
          <div className="mb-8">
            <div className="text-lg font-bold">{config.siteName}</div>
            {config.tagline && <p className="mt-1 text-sm opacity-70">{config.tagline}</p>}
          </div>
        )}
        <div className={`grid gap-8 ${gridClass}`}>
          {columns.map((col, i) => (
            <div key={i}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-70">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link, j) => {
                  const resolved = resolveLink(link.url);
                  return (
                    <li key={j}>
                      <a
                        href={resolved.href}
                        target={resolved.target}
                        className="text-sm opacity-80 transition hover:opacity-100 hover:underline"
                        style={resolved.color ? { color: resolved.color } : undefined}
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {copyrightText && <div className="mt-8 border-t border-white/20 pt-4 text-center text-xs opacity-60">{copyrightText}</div>}
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Update SimpleFooter.tsx**

Replace the contents of `src/lib/puck/components/chrome/SimpleFooter.tsx`:

```tsx
import type { SimpleFooterProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function SimpleFooter({ text, links, showPoweredBy }: SimpleFooterProps) {
  return (
    <footer className="border-t border-gray-200 px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
        <span>{text}</span>
        {links?.length > 0 && (
          <div className="flex gap-4">
            {links.map((link, i) => {
              const resolved = resolveLink(link.url);
              return (
                <a
                  key={i}
                  href={resolved.href}
                  target={resolved.target}
                  className="hover:text-gray-900 hover:underline"
                  style={resolved.color ? { color: resolved.color } : undefined}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
      {showPoweredBy && <div className="mt-2 text-center text-xs text-gray-400">Powered by FieldMapper</div>}
    </footer>
  );
}
```

- [ ] **Step 5: Run chrome component tests**

```bash
npm run test -- src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx --run
```

Expected: PASS (or minor test updates needed for new optional props)

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/components/chrome/HeaderBar.tsx src/lib/puck/components/chrome/AnnouncementBar.tsx src/lib/puck/components/chrome/FooterColumns.tsx src/lib/puck/components/chrome/SimpleFooter.tsx
git commit -m "feat: update chrome components for LinkValue, IconValue, and HeaderBar enhancements"
```

---

## Task 12: Update Puck Config — Page Components

Wire up the new custom fields in the page component Puck config.

**Files:**
- Modify: `src/lib/puck/config.ts`

- [ ] **Step 1: Create an asset-fetching function**

We need a function that returns the list of uploaded images for the image picker. Create `src/lib/puck/fields/fetch-assets.ts`:

```typescript
'use client';

import { createClient } from '@/lib/supabase/client';

export interface AssetItem {
  id: string;
  publicUrl: string;
  fileName: string;
}

/** Fetch image assets from the landing-assets Supabase bucket */
export async function fetchLandingAssets(): Promise<AssetItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('landing-assets')
    .list('images', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error || !data) return [];

  return data
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => {
      const { data: { publicUrl } } = supabase.storage.from('landing-assets').getPublicUrl(`images/${f.name}`);
      return {
        id: f.id ?? f.name,
        publicUrl,
        fileName: f.name,
      };
    });
}
```

- [ ] **Step 2: Update config.ts with new field types**

Replace the contents of `src/lib/puck/config.ts` with the updated config using the new field factories:

```typescript
import type { Config } from '@puckeditor/core';
import type {
  HeroProps,
  RichTextProps,
  ImageBlockProps,
  ButtonGroupProps,
  LinkListProps,
  StatsProps,
  GalleryProps,
  SpacerProps,
  ColumnsProps,
  SectionProps,
  CardProps,
  MapPreviewProps,
  TestimonialProps,
  EmbedProps,
} from './types';

import { Hero } from './components/page/Hero';
import { RichText } from './components/page/RichText';
import { ImageBlock } from './components/page/ImageBlock';
import { ButtonGroup } from './components/page/ButtonGroup';
import { LinkList } from './components/page/LinkList';
import { Stats } from './components/page/Stats';
import { Gallery } from './components/page/Gallery';
import { Spacer } from './components/page/Spacer';
import { Columns } from './components/page/Columns';
import { Section } from './components/page/Section';
import { Card } from './components/page/Card';
import { MapPreview } from './components/page/MapPreview';
import { Testimonial } from './components/page/Testimonial';
import { Embed } from './components/page/Embed';

import { imagePickerField, iconPickerField, linkField } from './fields';
import { fetchLandingAssets } from './fields/fetch-assets';

type PageComponents = {
  Hero: HeroProps;
  RichText: RichTextProps;
  ImageBlock: ImageBlockProps;
  ButtonGroup: ButtonGroupProps;
  LinkList: LinkListProps;
  Stats: StatsProps;
  Gallery: GalleryProps;
  Spacer: SpacerProps;
  Columns: ColumnsProps;
  Section: SectionProps;
  Card: CardProps;
  MapPreview: MapPreviewProps;
  Testimonial: TestimonialProps;
  Embed: EmbedProps;
};

const themeColorOptions = [
  { label: 'Default', value: 'default' },
  { label: 'Primary', value: 'primary' },
  { label: 'Accent', value: 'accent' },
  { label: 'Surface', value: 'surface' },
  { label: 'Muted', value: 'muted' },
];

export const pageConfig: Config<PageComponents> = {
  components: {
    Hero: {
      label: 'Hero',
      defaultProps: {
        title: 'Welcome',
        subtitle: '',
        backgroundImageUrl: '',
        overlay: 'primary',
        ctaLabel: '',
        ctaHref: '',
      },
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        backgroundImageUrl: imagePickerField('Background Image', fetchLandingAssets),
        overlay: {
          type: 'select',
          label: 'Overlay',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Dark', value: 'dark' },
            { label: 'None', value: 'none' },
          ],
        },
        ctaLabel: { type: 'text', label: 'CTA Label' },
        ctaHref: linkField('CTA Link'),
        icon: iconPickerField('Icon'),
      },
      render: Hero,
    },

    RichText: {
      label: 'Rich Text',
      defaultProps: {
        content: '',
        alignment: 'left',
        columns: 1,
      },
      fields: {
        content: { type: 'textarea', label: 'Content' },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
        },
        columns: {
          type: 'radio',
          label: 'Columns',
          options: [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
          ],
        },
      },
      render: RichText,
    },

    ImageBlock: {
      label: 'Image',
      defaultProps: {
        url: '',
        alt: '',
        caption: '',
        width: 'full',
        linkHref: '',
      },
      fields: {
        url: imagePickerField('Image', fetchLandingAssets),
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption' },
        width: {
          type: 'select',
          label: 'Width',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Full', value: 'full' },
          ],
        },
        linkHref: linkField('Link URL'),
      },
      render: ImageBlock,
    },

    ButtonGroup: {
      label: 'Button Group',
      defaultProps: {
        buttons: [],
      },
      fields: {
        buttons: {
          type: 'array',
          label: 'Buttons',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: linkField('Link'),
            style: {
              type: 'select',
              label: 'Style',
              options: [
                { label: 'Primary', value: 'primary' },
                { label: 'Outline', value: 'outline' },
              ],
            },
            size: {
              type: 'select',
              label: 'Size',
              options: [
                { label: 'Default', value: 'default' },
                { label: 'Large', value: 'large' },
              ],
            },
          },
          defaultItemProps: {
            label: 'Button',
            href: '#',
            style: 'primary',
            size: 'default',
          },
        },
      },
      render: ButtonGroup,
    },

    LinkList: {
      label: 'Link List',
      defaultProps: {
        items: [],
        layout: 'stacked',
      },
      fields: {
        items: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: linkField('URL'),
            description: { type: 'text', label: 'Description' },
          },
          defaultItemProps: {
            label: 'Link',
            url: '#',
            description: '',
          },
        },
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Inline', value: 'inline' },
            { label: 'Stacked', value: 'stacked' },
          ],
        },
      },
      render: LinkList,
    },

    Stats: {
      label: 'Stats',
      defaultProps: {
        source: 'manual',
        items: [],
      },
      fields: {
        source: {
          type: 'radio',
          label: 'Source',
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Manual', value: 'manual' },
          ],
        },
        items: {
          type: 'array',
          label: 'Items',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: {
            label: 'Stat',
            value: '0',
          },
        },
      },
      render: Stats,
    },

    Gallery: {
      label: 'Gallery',
      defaultProps: {
        images: [],
        columns: 3,
      },
      fields: {
        images: {
          type: 'array',
          label: 'Images',
          arrayFields: {
            url: imagePickerField('Image', fetchLandingAssets),
            alt: { type: 'text', label: 'Alt Text' },
            caption: { type: 'text', label: 'Caption' },
          },
          defaultItemProps: {
            url: '',
            alt: '',
            caption: '',
          },
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      },
      render: Gallery,
    },

    Spacer: {
      label: 'Spacer',
      defaultProps: {
        size: 'medium',
      },
      fields: {
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      render: Spacer,
    },

    Columns: {
      label: 'Columns',
      defaultProps: {
        columnCount: 2,
      },
      fields: {
        columnCount: {
          type: 'select',
          label: 'Column Count',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      },
      render: Columns,
    },

    Section: {
      label: 'Section',
      defaultProps: {
        backgroundColor: 'default',
        backgroundImageUrl: '',
        paddingY: 'medium',
      },
      fields: {
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: themeColorOptions,
        },
        backgroundImageUrl: imagePickerField('Background Image', fetchLandingAssets),
        paddingY: {
          type: 'radio',
          label: 'Vertical Padding',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      render: Section,
    },

    Card: {
      label: 'Card',
      defaultProps: {
        imageUrl: '',
        title: '',
        text: '',
        linkHref: '',
        linkLabel: '',
      },
      fields: {
        imageUrl: imagePickerField('Image', fetchLandingAssets),
        title: { type: 'text', label: 'Title' },
        text: { type: 'textarea', label: 'Text' },
        linkHref: linkField('Link URL'),
        linkLabel: { type: 'text', label: 'Link Label' },
        icon: iconPickerField('Icon'),
      },
      render: Card,
    },

    MapPreview: {
      label: 'Map Preview',
      defaultProps: {
        height: 300,
        zoom: 10,
        showControls: true,
      },
      fields: {
        height: {
          type: 'select',
          label: 'Height',
          options: [
            { label: '200px', value: 200 },
            { label: '300px', value: 300 },
            { label: '400px', value: 400 },
          ],
        },
        zoom: {
          type: 'number',
          label: 'Zoom Level',
          min: 1,
          max: 18,
        },
        showControls: {
          type: 'radio',
          label: 'Show Controls',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: MapPreview,
    },

    Testimonial: {
      label: 'Testimonial',
      defaultProps: {
        quote: '',
        attribution: '',
        photoUrl: '',
        style: 'default',
      },
      fields: {
        quote: { type: 'textarea', label: 'Quote' },
        attribution: { type: 'text', label: 'Attribution' },
        photoUrl: imagePickerField('Photo', fetchLandingAssets),
        style: {
          type: 'radio',
          label: 'Style',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Accent', value: 'accent' },
          ],
        },
      },
      render: Testimonial,
    },

    Embed: {
      label: 'Embed',
      defaultProps: {
        url: '',
        title: '',
        height: 400,
      },
      fields: {
        url: { type: 'text', label: 'URL' },
        title: { type: 'text', label: 'Title' },
        height: {
          type: 'number',
          label: 'Height',
          min: 100,
          max: 800,
        },
      },
      render: Embed,
    },
  },
};
```

- [ ] **Step 3: Run config tests**

```bash
npm run test -- src/lib/puck/__tests__/config.test.ts --run
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/puck/config.ts src/lib/puck/fields/fetch-assets.ts
git commit -m "feat: wire custom fields into page component Puck config"
```

---

## Task 13: Update Puck Config — Chrome Components

Wire up the new custom fields and HeaderBar enhancements in the chrome component Puck config.

**Files:**
- Modify: `src/lib/puck/chrome-config.ts`

- [ ] **Step 1: Update chrome-config.ts with HeaderBar enhancements and field swaps**

Replace the contents of `src/lib/puck/chrome-config.ts`:

```typescript
import type { Config } from '@puckeditor/core';
import type {
  HeaderBarProps,
  NavBarProps,
  AnnouncementBarProps,
  FooterColumnsProps,
  SocialLinksProps,
  SimpleFooterProps,
} from './types';

import { HeaderBar } from './components/chrome/HeaderBar';
import { NavBar } from './components/chrome/NavBar';
import { AnnouncementBar } from './components/chrome/AnnouncementBar';
import { FooterColumns } from './components/chrome/FooterColumns';
import { SocialLinks } from './components/chrome/SocialLinks';
import { SimpleFooter } from './components/chrome/SimpleFooter';

import { imagePickerField, iconPickerField, linkField, colorPickerField } from './fields';
import { fetchLandingAssets } from './fields/fetch-assets';

type ChromeComponents = {
  HeaderBar: HeaderBarProps;
  NavBar: NavBarProps;
  AnnouncementBar: AnnouncementBarProps;
  FooterColumns: FooterColumnsProps;
  SocialLinks: SocialLinksProps;
  SimpleFooter: SimpleFooterProps;
};

export const chromeConfig: Config<ChromeComponents> = {
  components: {
    HeaderBar: {
      label: 'Header Bar',
      defaultProps: {
        layout: 'left-aligned',
        showTagline: false,
        backgroundColor: 'default',
      },
      fields: {
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Left Aligned', value: 'left-aligned' },
            { label: 'Centered', value: 'centered' },
          ],
        },
        logoUrl: imagePickerField('Logo', fetchLandingAssets),
        icon: iconPickerField('Icon'),
        iconPosition: {
          type: 'radio',
          label: 'Icon Position',
          options: [
            { label: 'Before Name', value: 'before-name' },
            { label: 'After Name', value: 'after-name' },
            { label: 'Above Name', value: 'above-name' },
          ],
        },
        showTagline: {
          type: 'radio',
          label: 'Show Tagline',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Primary', value: 'primary' },
            { label: 'Primary Dark', value: 'primary-dark' },
            { label: 'Surface', value: 'surface' },
          ],
        },
        nameSize: {
          type: 'select',
          label: 'Name Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
            { label: 'XL', value: 'xl' },
          ],
        },
        nameWeight: {
          type: 'select',
          label: 'Name Weight',
          options: [
            { label: 'Normal', value: 'normal' },
            { label: 'Medium', value: 'medium' },
            { label: 'Semibold', value: 'semibold' },
            { label: 'Bold', value: 'bold' },
          ],
        },
        nameColor: colorPickerField('Name Color'),
        taglineSize: {
          type: 'select',
          label: 'Tagline Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
            { label: 'XL', value: 'xl' },
          ],
        },
        taglineWeight: {
          type: 'select',
          label: 'Tagline Weight',
          options: [
            { label: 'Normal', value: 'normal' },
            { label: 'Medium', value: 'medium' },
            { label: 'Semibold', value: 'semibold' },
            { label: 'Bold', value: 'bold' },
          ],
        },
        taglineColor: colorPickerField('Tagline Color'),
        links: {
          type: 'array',
          label: 'Header Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: { type: 'text', label: 'URL' },
          },
          defaultItemProps: {
            label: 'Link',
            href: '#',
          },
        },
        linkColor: colorPickerField('Link Color'),
      },
      render: HeaderBar,
    },

    NavBar: {
      label: 'Nav Bar',
      defaultProps: {
        style: 'horizontal',
        position: 'below-header',
        showMobileBottomBar: false,
      },
      fields: {
        style: {
          type: 'select',
          label: 'Style',
          options: [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Hamburger', value: 'hamburger' },
            { label: 'Tabs', value: 'tabs' },
          ],
        },
        position: {
          type: 'radio',
          label: 'Position',
          options: [
            { label: 'Below Header', value: 'below-header' },
            { label: 'Sticky', value: 'sticky' },
          ],
        },
        showMobileBottomBar: {
          type: 'radio',
          label: 'Show Mobile Bottom Bar',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: NavBar,
    },

    AnnouncementBar: {
      label: 'Announcement Bar',
      defaultProps: {
        text: '',
        linkUrl: '',
        backgroundColor: 'primary',
      },
      fields: {
        text: { type: 'text', label: 'Text' },
        linkUrl: linkField('Link URL'),
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Accent', value: 'accent' },
            { label: 'Surface', value: 'surface' },
          ],
        },
      },
      render: AnnouncementBar,
    },

    FooterColumns: {
      label: 'Footer Columns',
      defaultProps: {
        columns: [],
        showBranding: true,
        copyrightText: '',
      },
      fields: {
        columns: {
          type: 'array',
          label: 'Columns',
          arrayFields: {
            title: { type: 'text', label: 'Title' },
            links: {
              type: 'array',
              label: 'Links',
              arrayFields: {
                label: { type: 'text', label: 'Label' },
                url: linkField('URL'),
              },
              defaultItemProps: {
                label: 'Link',
                url: '#',
              },
            },
          },
          defaultItemProps: {
            title: 'Column',
            links: [],
          },
        },
        showBranding: {
          type: 'radio',
          label: 'Show Branding',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        copyrightText: { type: 'text', label: 'Copyright Text' },
      },
      render: FooterColumns,
    },

    SocialLinks: {
      label: 'Social Links',
      defaultProps: {
        links: [],
        size: 'medium',
        alignment: 'left',
      },
      fields: {
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            platform: {
              type: 'select',
              label: 'Platform',
              options: [
                { label: 'Facebook', value: 'facebook' },
                { label: 'Twitter/X', value: 'twitter' },
                { label: 'Instagram', value: 'instagram' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'GitHub', value: 'github' },
                { label: 'LinkedIn', value: 'linkedin' },
              ],
            },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: {
            platform: 'facebook',
            url: '',
          },
        },
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
        },
      },
      render: SocialLinks,
    },

    SimpleFooter: {
      label: 'Simple Footer',
      defaultProps: {
        text: '',
        links: [],
        showPoweredBy: false,
      },
      fields: {
        text: { type: 'text', label: 'Text' },
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: linkField('URL'),
          },
          defaultItemProps: {
            label: 'Link',
            url: '#',
          },
        },
        showPoweredBy: {
          type: 'radio',
          label: 'Show Powered By',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: SimpleFooter,
    },
  },
};
```

- [ ] **Step 2: Run all Puck tests**

```bash
npm run test -- src/lib/puck/ --run
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/puck/chrome-config.ts
git commit -m "feat: wire custom fields into chrome component Puck config"
```

---

## Task 14: Update Existing Tests

Update the existing test files to match the new component prop shapes and behavior.

**Files:**
- Modify: `src/lib/puck/components/page/__tests__/page-components.test.tsx`
- Modify: `src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx`

- [ ] **Step 1: Update page-components.test.tsx for new prop types**

The key changes needed: Hero, ImageBlock, Card, ButtonGroup, and LinkList components now accept `LinkValue` objects via `resolveLink`. Tests should verify both legacy string props (backwards compat) and new object props work.

Add these tests to the existing file `src/lib/puck/components/page/__tests__/page-components.test.tsx`:

After the existing Hero tests, add:

```tsx
it('renders CTA with LinkValue object', () => {
  render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="Go" ctaHref={{ href: '/signup', target: '_blank', color: '#ff0000' }} />);
  const link = screen.getByRole('link', { name: 'Go' });
  expect(link.getAttribute('href')).toBe('/signup');
  expect(link.getAttribute('target')).toBe('_blank');
});

it('renders optional icon', () => {
  render(<Hero title="Hello" subtitle="" backgroundImageUrl="" overlay="none" ctaLabel="" ctaHref="" icon={{ set: 'lucide', name: 'Bird' }} />);
  // IconRenderer is async, just verify no crash
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeDefined();
});
```

After the existing ImageBlock tests, add:

```tsx
it('wraps in link with LinkValue object', () => {
  render(<ImageBlock url="/bird.jpg" alt="Bird" caption="" width="medium" linkHref={{ href: 'https://example.com', target: '_blank' }} />);
  const link = screen.getByRole('link');
  expect(link.getAttribute('href')).toBe('https://example.com');
  expect(link.getAttribute('target')).toBe('_blank');
});
```

After the existing ButtonGroup tests, add:

```tsx
it('handles LinkValue objects in buttons', () => {
  render(<ButtonGroup buttons={[{ label: 'Go', href: { href: '/page', target: undefined }, style: 'primary', size: 'default' }]} />);
  const link = screen.getByRole('link', { name: 'Go' });
  expect(link.getAttribute('href')).toBe('/page');
});
```

- [ ] **Step 2: Run updated tests**

```bash
npm run test -- src/lib/puck/components/page/__tests__/page-components.test.tsx --run
```

Expected: PASS

- [ ] **Step 3: Update chrome-components.test.tsx for HeaderBar enhancements**

Read the existing chrome tests and add tests for the new HeaderBar props. Add to the HeaderBar describe block:

```tsx
it('renders custom logo when logoUrl is set', () => {
  render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="default" logoUrl="https://example.com/logo.png" />);
  const img = screen.getByRole('img');
  expect(img.getAttribute('src')).toBe('https://example.com/logo.png');
});

it('renders header links', () => {
  render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="default" links={[{ label: 'Contact', href: '/contact' }]} />);
  const link = screen.getByRole('link', { name: 'Contact' });
  expect(link.getAttribute('href')).toBe('/contact');
});

it('applies custom name typography', () => {
  const { container } = render(<HeaderBar layout="left-aligned" showTagline={false} backgroundColor="default" nameSize="xl" nameWeight="semibold" />);
  const nameSpan = container.querySelector('.text-2xl');
  expect(nameSpan).not.toBeNull();
});
```

- [ ] **Step 4: Run chrome tests**

```bash
npm run test -- src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx --run
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/puck/components/page/__tests__/page-components.test.tsx src/lib/puck/components/chrome/__tests__/chrome-components.test.tsx
git commit -m "test: update component tests for LinkValue, IconValue, and HeaderBar enhancements"
```

---

## Task 15: Full Test Suite and Type Check

Run the complete test suite and type checker to verify everything works together.

**Files:**
- No file changes — verification only

- [ ] **Step 1: Run type checker**

```bash
npm run type-check
```

Expected: PASS — no type errors

- [ ] **Step 2: Run all Puck-related tests**

```bash
npm run test -- src/lib/puck/ --run
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

```bash
npm run test -- --run
```

Expected: PASS — all tests pass

- [ ] **Step 4: Fix any failures**

If any tests fail, fix them. Common issues:
- Mock updates needed for new imports (`resolveLink`, `IconRenderer`)
- Test assertions that assumed string-only link values
- Missing mock for `useConfig` in HeaderBar tests

- [ ] **Step 5: Run build to verify production compilation**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds

- [ ] **Step 6: Commit any test fixes**

```bash
git add -A
git commit -m "fix: resolve test and type errors from Puck editor enhancements"
```
