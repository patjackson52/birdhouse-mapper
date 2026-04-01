# Logo Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual logo URL paste with an upload system that generates PWA icon variants, serves them in the manifest, and provides default starter logos.

**Architecture:** Upload images via a server action that uses `sharp` to resize to PWA/favicon variants, store all variants in a `branding` Supabase storage bucket, and update the manifest route to serve correct icon URLs. A `LogoUploader` component replaces the text input in org/property settings.

**Tech Stack:** sharp, Supabase Storage, Next.js server actions, React

---

### Task 1: Install sharp and create branding storage bucket

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/024_branding_bucket.sql`

- [ ] **Step 1: Install sharp**

```bash
npm install sharp
npm install --save-dev @types/sharp
```

- [ ] **Step 2: Create branding bucket migration**

Create `supabase/migrations/024_branding_bucket.sql`:

```sql
-- Create branding storage bucket for logos and icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view branding assets
CREATE POLICY "Public read access for branding"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');

-- Authenticated org admins can upload branding assets
CREATE POLICY "Org admins can upload branding assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- Authenticated org admins can update branding assets
CREATE POLICY "Org admins can update branding assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- Authenticated org admins can delete branding assets
CREATE POLICY "Org admins can delete branding assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );
```

- [ ] **Step 3: Apply migration locally**

```bash
npx supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json supabase/migrations/024_branding_bucket.sql
git commit -m "feat: install sharp and create branding storage bucket"
```

---

### Task 2: Create getLogoUrl helper

**Files:**
- Create: `src/lib/config/logo.ts`

- [ ] **Step 1: Create the helper**

Create `src/lib/config/logo.ts`:

```typescript
import { createClient } from '@/lib/supabase/client';

export type LogoVariant = 'original.png' | 'icon-192.png' | 'icon-512.png' | 'icon-512-maskable.png' | 'favicon-32.png';

const DEFAULT_LOGO_PATH = '/defaults/logos/fieldmapper.png';

/**
 * Build the full public URL for a logo variant stored in the branding bucket.
 * If basePath is null, returns the default logo path.
 */
export function getLogoUrl(basePath: string | null, variant: LogoVariant): string {
  if (!basePath) return DEFAULT_LOGO_PATH;

  const supabase = createClient();
  return supabase.storage.from('branding').getPublicUrl(`${basePath}/${variant}`).data.publicUrl;
}
```

- [ ] **Step 2: Create a server-side version**

The manifest route runs on the server where we use the server supabase client. Add a server version to the same file won't work (mixing client/server). Create `src/lib/config/logo-server.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';

export type LogoVariant = 'original.png' | 'icon-192.png' | 'icon-512.png' | 'icon-512-maskable.png' | 'favicon-32.png';

const DEFAULT_ICONS: Record<string, string> = {
  'icon-192.png': '/defaults/logos/icon-192.png',
  'icon-512.png': '/defaults/logos/icon-512.png',
  'icon-512-maskable.png': '/defaults/logos/icon-512-maskable.png',
  'favicon-32.png': '/defaults/logos/favicon-32.png',
  'original.png': '/defaults/logos/fieldmapper.png',
};

/**
 * Build the full public URL for a logo variant (server-side).
 * Falls back to default icons shipped as static assets.
 */
export function getLogoUrlServer(basePath: string | null, variant: LogoVariant): string {
  if (!basePath) return DEFAULT_ICONS[variant] ?? DEFAULT_ICONS['original.png'];

  const supabase = createClient();
  return supabase.storage.from('branding').getPublicUrl(`${basePath}/${variant}`).data.publicUrl;
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/logo.ts src/lib/config/logo-server.ts
git commit -m "feat: add getLogoUrl helpers for branding variants"
```

---

### Task 3: Create default starter logos

**Files:**
- Create: `public/defaults/logos/fieldmapper.png`
- Create: `public/defaults/logos/birdhouse.png`
- Create: `public/defaults/logos/binoculars.png`
- Create: `public/defaults/logos/leaf.png`
- Create: `public/defaults/logos/icon-192.png`
- Create: `public/defaults/logos/icon-512.png`
- Create: `public/defaults/logos/icon-512-maskable.png`
- Create: `public/defaults/logos/favicon-32.png`

- [ ] **Step 1: Create the defaults directory and generate placeholder logos**

Use a script to generate simple default logos using sharp. Create a one-time generation script `scripts/generate-default-logos.ts`:

```typescript
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'public/defaults/logos');

async function generateLogo(name: string, emoji: string, bgColor: string) {
  // Generate a simple SVG-based logo
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="64" fill="${bgColor}"/>
      <text x="256" y="300" font-size="256" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    </svg>`;

  const buffer = Buffer.from(svg);
  await sharp(buffer).resize(512, 512).png().toFile(path.join(OUT_DIR, `${name}.png`));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Generate preset logos
  await generateLogo('fieldmapper', '📍', '#2563eb');
  await generateLogo('birdhouse', '🏠', '#5D7F3A');
  await generateLogo('binoculars', '🔭', '#8B5E3C');
  await generateLogo('leaf', '🌿', '#2d5a27');

  // Generate PWA icon variants from fieldmapper (default)
  const source = path.join(OUT_DIR, 'fieldmapper.png');
  await sharp(source).resize(192, 192).toFile(path.join(OUT_DIR, 'icon-192.png'));
  await sharp(source).resize(512, 512).toFile(path.join(OUT_DIR, 'icon-512.png'));

  // Maskable: add 20% padding (safe zone)
  const maskableSize = Math.floor(512 * 0.8);
  const padding = Math.floor((512 - maskableSize) / 2);
  await sharp(source)
    .resize(maskableSize, maskableSize)
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#2563eb' })
    .toFile(path.join(OUT_DIR, 'icon-512-maskable.png'));

  await sharp(source).resize(32, 32).toFile(path.join(OUT_DIR, 'favicon-32.png'));

  console.log('Default logos generated in', OUT_DIR);
}

main();
```

- [ ] **Step 2: Run the script**

```bash
npx tsx scripts/generate-default-logos.ts
```

- [ ] **Step 3: Verify files exist**

```bash
ls -la public/defaults/logos/
```

Expected: 8 PNG files (fieldmapper, birdhouse, binoculars, leaf, icon-192, icon-512, icon-512-maskable, favicon-32).

- [ ] **Step 4: Commit**

```bash
git add public/defaults/logos/ scripts/generate-default-logos.ts
git commit -m "feat: add default starter logos and PWA icon variants"
```

---

### Task 4: Create logo upload server action

**Files:**
- Create: `src/app/admin/settings/logo-actions.ts`

- [ ] **Step 1: Create the server action**

Create `src/app/admin/settings/logo-actions.ts`:

```typescript
'use server';

import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function uploadLogo(
  formData: FormData,
  scope: 'org' | 'property',
  propertyId?: string,
): Promise<{ success?: boolean; basePath?: string; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const file = formData.get('logo') as File | null;
  if (!file) return { error: 'No file provided' };

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return { error: 'File must be an image' };
  }

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'Image must be under 5MB' };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const basePath = scope === 'property' && propertyId
    ? `${tenant.orgId}/${propertyId}`
    : `${tenant.orgId}`;

  // Generate variants
  const variants: { name: string; buffer: Buffer }[] = [];

  // Original (max 1024px, preserve aspect ratio)
  const original = await sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  variants.push({ name: 'original.png', buffer: original });

  // PWA icons (square, cover)
  const icon192 = await sharp(buffer).resize(192, 192, { fit: 'cover' }).png().toBuffer();
  variants.push({ name: 'icon-192.png', buffer: icon192 });

  const icon512 = await sharp(buffer).resize(512, 512, { fit: 'cover' }).png().toBuffer();
  variants.push({ name: 'icon-512.png', buffer: icon512 });

  // Maskable icon (20% safe zone padding)
  const maskableInner = Math.floor(512 * 0.8);
  const padding = Math.floor((512 - maskableInner) / 2);
  const maskable = await sharp(buffer)
    .resize(maskableInner, maskableInner, { fit: 'cover' })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 37, g: 99, b: 235, alpha: 1 } })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-512-maskable.png', buffer: maskable });

  // Favicon
  const favicon = await sharp(buffer).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  variants.push({ name: 'favicon-32.png', buffer: favicon });

  // Upload all variants to branding bucket
  for (const variant of variants) {
    const { error } = await supabase.storage
      .from('branding')
      .upload(`${basePath}/${variant.name}`, variant.buffer, {
        contentType: 'image/png',
        upsert: true,
      });
    if (error) {
      return { error: `Failed to upload ${variant.name}: ${error.message}` };
    }
  }

  // Save base path to org or property
  if (scope === 'property' && propertyId) {
    const { error } = await supabase
      .from('properties')
      .update({ logo_url: basePath })
      .eq('id', propertyId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('orgs')
      .update({ logo_url: basePath })
      .eq('id', tenant.orgId);
    if (error) return { error: error.message };
  }

  return { success: true, basePath };
}

export async function uploadDefaultLogo(
  defaultName: string,
  scope: 'org' | 'property',
  propertyId?: string,
): Promise<{ success?: boolean; basePath?: string; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Read the default logo from public/defaults/logos/
  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/defaults/logos/${defaultName}.png`);
  if (!response.ok) return { error: 'Default logo not found' };

  const buffer = Buffer.from(await response.arrayBuffer());

  // Reuse the upload logic by creating a FormData with the buffer
  const formData = new FormData();
  formData.set('logo', new Blob([buffer], { type: 'image/png' }), `${defaultName}.png`);

  return uploadLogo(formData, scope, propertyId);
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/settings/logo-actions.ts
git commit -m "feat: add logo upload server action with sharp resize"
```

---

### Task 5: Create LogoUploader component

**Files:**
- Create: `src/components/admin/LogoUploader.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/LogoUploader.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { uploadLogo, uploadDefaultLogo } from '@/app/admin/settings/logo-actions';

const DEFAULT_LOGOS = [
  { name: 'fieldmapper', label: 'FieldMapper', src: '/defaults/logos/fieldmapper.png' },
  { name: 'birdhouse', label: 'Birdhouse', src: '/defaults/logos/birdhouse.png' },
  { name: 'binoculars', label: 'Binoculars', src: '/defaults/logos/binoculars.png' },
  { name: 'leaf', label: 'Leaf', src: '/defaults/logos/leaf.png' },
];

interface LogoUploaderProps {
  currentLogoUrl: string | null;
  scope: 'org' | 'property';
  propertyId?: string;
  onUploaded: (basePath: string) => void;
}

export default function LogoUploader({ currentLogoUrl, scope, propertyId, onUploaded }: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set('logo', file);

    const result = await uploadLogo(formData, scope, propertyId);
    setUploading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.basePath) {
      onUploaded(result.basePath);
    }
  }

  async function handleDefaultSelect(defaultName: string) {
    setUploading(true);
    setError(null);

    const result = await uploadDefaultLogo(defaultName, scope, propertyId);
    setUploading(false);

    if (result.error) {
      setError(result.error);
    } else if (result.basePath) {
      onUploaded(result.basePath);
    }
  }

  return (
    <div className="space-y-4">
      {/* Current logo preview */}
      {currentLogoUrl && (
        <div className="flex items-center gap-3">
          <img
            src={currentLogoUrl}
            alt="Current logo"
            className="h-16 w-16 object-contain rounded border border-sage-light"
          />
          <span className="text-sm text-sage">Current logo</span>
        </div>
      )}

      {/* Upload custom */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-primary text-sm"
        >
          {uploading ? 'Uploading...' : 'Upload Custom Logo'}
        </button>
        <p className="mt-1 text-xs text-sage">
          PNG, JPG, or SVG. Max 5MB. Will be resized for PWA icons and favicon.
        </p>
      </div>

      {/* Default presets */}
      <div>
        <p className="text-sm font-medium text-forest-dark mb-2">Or choose a default:</p>
        <div className="flex gap-3">
          {DEFAULT_LOGOS.map((logo) => (
            <button
              key={logo.name}
              type="button"
              onClick={() => handleDefaultSelect(logo.name)}
              disabled={uploading}
              className="flex flex-col items-center gap-1 p-2 rounded-lg border border-sage-light hover:border-forest transition-colors disabled:opacity-50"
            >
              <img src={logo.src} alt={logo.label} className="h-12 w-12 object-contain" />
              <span className="text-xs text-sage">{logo.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/LogoUploader.tsx
git commit -m "feat: add LogoUploader component with presets and file upload"
```

---

### Task 6: Replace logo URL input in org settings

**Files:**
- Modify: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Replace the logo URL text input with LogoUploader**

In `src/app/admin/settings/page.tsx`:

Add import at top:
```tsx
import LogoUploader from '@/components/admin/LogoUploader';
import { getLogoUrl } from '@/lib/config/logo';
```

Remove the `logoUrl` form state (`const [logoUrl, setLogoUrl] = useState('');`) and its initialization in the useEffect.

Remove the `logoUrl` diff check in `handleSave` (the line `if (logoUrl !== (settings.logo_url ?? '')) updates.logo_url = logoUrl;`).

Replace the Logo URL `<div>` section (the text input, preview, and help text) in the Appearance section with:

```tsx
<div>
  <label className="label">Logo</label>
  <LogoUploader
    currentLogoUrl={settings?.logo_url ? getLogoUrl(settings.logo_url, 'original.png') : null}
    scope="org"
    onUploaded={async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      router.refresh();
    }}
  />
</div>
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/settings/page.tsx
git commit -m "feat: replace logo URL input with LogoUploader in org settings"
```

---

### Task 7: Update manifest route to use logo variants

**Files:**
- Modify: `src/app/api/manifest.json/route.ts`

- [ ] **Step 1: Update the manifest route**

Replace the entire file `src/app/api/manifest.json/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config/server';
import { getLogoUrlServer } from '@/lib/config/logo-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const config = await getConfig();

  const manifest = {
    name: config.siteName || 'FieldMapper',
    short_name: config.siteName?.slice(0, 12) || 'FieldMapper',
    description: config.tagline || 'Field mapping for conservation teams',
    start_url: '/map',
    display: 'standalone' as const,
    orientation: 'any' as const,
    theme_color: '#2563eb',
    background_color: '#ffffff',
    icons: [
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: getLogoUrlServer(config.logoUrl, 'icon-512-maskable.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/manifest.json/route.ts
git commit -m "feat: update manifest route to use logo variants with fallback"
```

---

### Task 8: Add favicon link to layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add favicon link tag**

In `src/app/layout.tsx`, inside the `<head>` tag (after the theme-color meta tag on line 63), add:

```tsx
<link rel="icon" type="image/png" sizes="32x32" href="/defaults/logos/favicon-32.png" />
```

Note: This uses the static default favicon. For per-tenant favicons, the dynamic manifest already handles PWA icons. A fully dynamic favicon would require a route handler, which is out of scope — the static default is sufficient for the browser tab.

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add default favicon link to layout"
```

---

### Task 9: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

```bash
npm run type-check
```

Expected: No type errors.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Manual verification**

Start dev server and verify:
- Default logos appear at `/defaults/logos/fieldmapper.png` etc.
- Manifest at `/api/manifest.json` returns default icon URLs when no logo configured
- Org settings page shows LogoUploader instead of text input
