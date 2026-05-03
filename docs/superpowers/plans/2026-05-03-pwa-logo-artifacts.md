# PWA Logo Artifacts Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the blue halo around installed PWA icons (#314) by switching the maskable safe-zone padding from opaque blue to white, replacing `fit: 'cover'` with `fit: 'contain'` (white background) so non-square logos aren't cropped, and adding a per-org `apple-touch-icon-180.png` variant plus dynamic favicon so iOS uses the org logo.

**Architecture:** All icon variants are generated server-side by `sharp` in `src/app/admin/settings/logo-actions.ts` and uploaded to the Supabase `vault-public` bucket. URLs are resolved via `getLogoUrlServer()` in `src/lib/config/logo-server.ts`, which falls back to static defaults under `/defaults/logos/` when an org has no uploaded logo. The PWA manifest at `src/app/api/manifest.json/route.ts` references variant filenames; only the bytes change. `src/app/layout.tsx` renders the icon `<link>` tags.

**Tech Stack:** Next.js 14, sharp (image processing), Supabase Storage, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-03-pwa-logo-artifacts-design.md`

---

## File Structure

- **Modify** `src/lib/config/logo-server.ts` — add `'apple-touch-icon-180.png'` to `LogoVariant` union and `DEFAULT_ICONS` map.
- **Modify** `src/lib/config/__tests__/logo-server.test.ts` — assert the new variant's default fallback and storage URL.
- **Modify** `src/app/admin/settings/logo-actions.ts` — change all `fit: 'cover'` → `fit: 'contain'` with white background, change maskable padding from blue to white, add new `apple-touch-icon-180.png` variant.
- **Modify** `src/app/layout.tsx` — switch hard-coded favicon `<link>` to dynamic per-org URL, add `<link rel="apple-touch-icon">`.

---

### Task 1: Extend `LogoVariant` type and default map

**Files:**
- Modify: `src/lib/config/logo-server.ts`
- Test: `src/lib/config/__tests__/logo-server.test.ts`

- [ ] **Step 1: Write the failing tests**

Edit `src/lib/config/__tests__/logo-server.test.ts`. Inside the `it('returns variant-specific default when basePath is null', ...)` block, add an assertion for the new variant. Then add a new `it` block for the storage URL case.

```ts
  it('returns variant-specific default when basePath is null', () => {
    expect(getLogoUrlServer(null, 'icon-192.png')).toBe('/defaults/logos/icon-192.png');
    expect(getLogoUrlServer(null, 'icon-512.png')).toBe('/defaults/logos/icon-512.png');
    expect(getLogoUrlServer(null, 'icon-512-maskable.png')).toBe('/defaults/logos/icon-512-maskable.png');
    expect(getLogoUrlServer(null, 'favicon-32.png')).toBe('/defaults/logos/favicon-32.png');
    expect(getLogoUrlServer(null, 'apple-touch-icon-180.png')).toBe('/defaults/logos/icon-192.png');
    expect(getLogoUrlServer(null, 'original.png')).toBe('/defaults/logos/fieldmapper.png');
  });

  it('builds storage URL for apple-touch-icon-180 variant', () => {
    const url = getLogoUrlServer('org-123', 'apple-touch-icon-180.png');
    expect(url).toBe('https://storage.test/vault-public/org-123/apple-touch-icon-180.png');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/config/__tests__/logo-server.test.ts --run`
Expected: TypeScript error in the test file: `Argument of type '"apple-touch-icon-180.png"' is not assignable to parameter of type 'LogoVariant'`. (Vitest will report a transform/type failure.)

- [ ] **Step 3: Add the variant to the type and defaults**

Edit `src/lib/config/logo-server.ts`. Replace the `LogoVariant` type and the `DEFAULT_ICONS` map:

```ts
export type LogoVariant =
  | 'original.png'
  | 'icon-192.png'
  | 'icon-512.png'
  | 'icon-512-maskable.png'
  | 'favicon-32.png'
  | 'apple-touch-icon-180.png';

const DEFAULT_ICONS: Record<string, string> = {
  'icon-192.png': '/defaults/logos/icon-192.png',
  'icon-512.png': '/defaults/logos/icon-512.png',
  'icon-512-maskable.png': '/defaults/logos/icon-512-maskable.png',
  'favicon-32.png': '/defaults/logos/favicon-32.png',
  'apple-touch-icon-180.png': '/defaults/logos/icon-192.png',
  'original.png': '/defaults/logos/fieldmapper.png',
};
```

Note: the `apple-touch-icon-180.png` default deliberately points at the existing `icon-192.png` static asset to avoid shipping a new file. iOS will downscale 192→180 cleanly, and this default only applies to orgs that have not uploaded a logo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/config/__tests__/logo-server.test.ts --run`
Expected: PASS, all assertions green.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/logo-server.ts src/lib/config/__tests__/logo-server.test.ts
git commit -m "feat(logo): add apple-touch-icon-180 variant to LogoVariant type"
```

---

### Task 2: Switch icon generation to white background + `fit: 'contain'`

**Files:**
- Modify: `src/app/admin/settings/logo-actions.ts:36-62`

This task changes the bytes of every generated variant. There are no automated tests for binary image output (consistent with existing code), so verification is by code review and the manual PWA install in Task 4.

- [ ] **Step 1: Replace the variant-generation block**

Open `src/app/admin/settings/logo-actions.ts`. Replace lines 36-62 (the comment `// Generate variants` through the final `variants.push({ name: 'favicon-32.png', buffer: favicon });` line) with:

```ts
  // Generate variants
  const variants: { name: string; buffer: Buffer }[] = [];

  // Solid white background applied to every square variant so non-square
  // logos render letterboxed (not cropped) and platform masks (Android
  // adaptive icons, iOS rounded-rect) don't expose colored padding.
  const white = { r: 255, g: 255, b: 255, alpha: 1 } as const;

  // Original (max 1024px, preserve aspect ratio, no background fill)
  const original = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  variants.push({ name: 'original.png', buffer: original });

  // PWA icons (square, contain on white so non-square logos aren't cropped)
  const icon192 = await sharp(buffer)
    .resize(192, 192, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-192.png', buffer: icon192 });

  const icon512 = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-512.png', buffer: icon512 });

  // Maskable icon: 80% inner safe zone, 10% padding on each side, white fill
  const maskableInner = Math.floor(512 * 0.8);
  const padding = Math.floor((512 - maskableInner) / 2);
  const maskable = await sharp(buffer)
    .resize(maskableInner, maskableInner, { fit: 'contain', background: white })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-512-maskable.png', buffer: maskable });

  // Apple touch icon (180x180 retina, white background — iOS does not honor
  // PNG transparency on home-screen icons)
  const appleTouch = await sharp(buffer)
    .resize(180, 180, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'apple-touch-icon-180.png', buffer: appleTouch });

  // Favicon
  const favicon = await sharp(buffer)
    .resize(32, 32, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'favicon-32.png', buffer: favicon });
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 3: Run the existing test suite**

Run: `npm run test -- --run`
Expected: All tests pass (the `logo-actions.ts` change has no unit tests; only verifying nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/logo-actions.ts
git commit -m "fix(logo): white background + fit:contain for PWA icons (#314)"
```

---

### Task 3: Wire favicon and apple-touch-icon to org logo in `layout.tsx`

**Files:**
- Modify: `src/app/layout.tsx:1-13` (imports), `src/app/layout.tsx:67-76` (head block)

- [ ] **Step 1: Add the import**

Open `src/app/layout.tsx`. The file currently has these imports near the top:

```ts
import '@/styles/globals.css';
import Navigation from '@/components/layout/Navigation';
import { PuckRootRenderer } from '@/components/puck/PuckRootRenderer';
import { ConfigProvider } from '@/lib/config/client';
import { getConfig } from '@/lib/config/server';
import { resolveTheme, themeToCssVars } from '@/lib/config/themes';
```

Add `getLogoUrlServer` next to the existing `@/lib/config/server` import. Replace:

```ts
import { getConfig } from '@/lib/config/server';
```

with:

```ts
import { getConfig } from '@/lib/config/server';
import { getLogoUrlServer } from '@/lib/config/logo-server';
```

- [ ] **Step 2: Replace the static favicon link and add the apple-touch-icon link**

Find the head block (around line 67-76):

```tsx
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
        <link rel="manifest" href="/api/manifest.json" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="icon" type="image/png" sizes="32x32" href="/defaults/logos/favicon-32.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
```

Replace it with:

```tsx
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
        <link rel="manifest" href="/api/manifest.json" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
        <meta name="theme-color" content="#2563eb" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={getLogoUrlServer(config.logoUrl, 'favicon-32.png')}
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={getLogoUrlServer(config.logoUrl, 'apple-touch-icon-180.png')}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
```

The `config` variable is already in scope on line 53 (`const config = await getConfig();`). `getLogoUrlServer` returns the static default when `config.logoUrl` is null, preserving zero-config behavior.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: No errors.

- [ ] **Step 4: Build to confirm SSR resolves the URLs**

Run: `npm run build`
Expected: Build succeeds. (No need to start the server here — Task 4 covers manual verification.)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(layout): dynamic favicon + apple-touch-icon per org (#314)"
```

---

### Task 4: Manual verification + visual diff screenshots

This task produces the artifacts required for the PR description per `docs/playbooks/visual-diff-screenshots.md`.

**Files:** none modified — verification + screenshots only.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server up on localhost.

- [ ] **Step 2: Upload a non-square test logo**

In a browser, log in as an org admin, navigate to admin settings → logo, upload a deliberately non-square logo (e.g., a wide horizontal logo PNG). Confirm the upload succeeds.

- [ ] **Step 3: Inspect generated variants**

In Supabase Studio (or via the storage explorer), open `vault-public/{orgId}/`. Confirm all six files exist:
- `original.png`
- `icon-192.png`
- `icon-512.png`
- `icon-512-maskable.png`
- `apple-touch-icon-180.png`
- `favicon-32.png`

Open each variant. Confirm:
- The non-square logo is fully visible (letterboxed on white), not cropped.
- The maskable icon's padding is white, not blue.

- [ ] **Step 4: Verify manifest references**

Open `http://localhost:3000/api/manifest.json` in a browser. Confirm the `icons[]` URLs resolve to the new files (open each in a new tab — they should render correctly).

- [ ] **Step 5: Install PWA on Android**

Use Chrome on a real Android device (or an emulator) to install the site as a PWA. Confirm the home-screen icon shows no blue halo.

Capture a screenshot. Save to a temp location for the PR description.

- [ ] **Step 6: Install on iOS**

Use Safari on iOS to "Add to Home Screen". Confirm the home-screen icon shows the org logo (not the default `fieldmapper.png` or generic).

Capture a screenshot.

- [ ] **Step 7: Capture before/after**

Per `docs/playbooks/visual-diff-screenshots.md`, save before/after screenshots into the location the playbook specifies and reference them in the PR description.

No commit for this task — verification only.

---

## Self-Review

Spec coverage:
- Spec §1 maskable padding → Task 2 ✓
- Spec §1 fit cover → contain → Task 2 ✓
- Spec §1 new apple-touch-icon-180 variant → Task 2 ✓
- Spec §2 LogoVariant type + DEFAULT_ICONS → Task 1 ✓
- Spec §3 logo-server tests → Task 1 ✓
- Spec §4 layout.tsx apple-touch-icon link → Task 3 ✓
- Spec §4 dynamic favicon href → Task 3 ✓
- Spec §5 no manifest changes → not needed ✓
- Verification (manual + visual diff) → Task 4 ✓

No placeholders. Variant names consistent across tasks (`apple-touch-icon-180.png` everywhere). White color literal `{ r:255, g:255, b:255, alpha:1 }` used consistently.
