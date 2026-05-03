# PWA Logo Artifacts Fix

**Issue:** [#314](https://github.com/patjackson52/birdhouse-mapper/issues/314)
**Followup wish:** [#315](https://github.com/patjackson52/birdhouse-mapper/issues/315) — per-org configurable PWA icon background color
**Date:** 2026-05-03

## Problem

When an admin uploads an org logo and the user installs the site as a PWA, the home-screen icon renders with a blue ring/halo around the logo on Android (see screenshot in #314).

## Root cause

`src/app/admin/settings/logo-actions.ts:50-58` generates the maskable icon variant with a 20% safe-zone padding filled with **opaque blue `#2563eb`**:

```ts
.extend({ top: padding, bottom: padding, left: padding, right: padding,
          background: { r: 37, g: 99, b: 235, alpha: 1 } })
```

Android's adaptive-icon system applies a circular (or other) mask to maskable PNGs and exposes the safe-zone padding around the logo. Because the padding is filled with brand-blue rather than the manifest's white `background_color`, every installed PWA icon shows a blue halo regardless of the org's actual logo or branding.

Two adjacent quality issues are also fixed in this PR:

1. **`fit: 'cover'`** on `icon-192`, `icon-512`, `icon-512-maskable` (inner), and `favicon-32` crops non-square logos to a square. Wide or tall logos get edges chopped.
2. **No `apple-touch-icon`** declared in `app/layout.tsx` — iOS home-screen install falls back to the default `/defaults/logos/favicon-32.png`, ignoring the org's logo entirely.

## Goals

- Maskable icon renders cleanly on Android with no colored halo.
- Non-square logos render fully (letterboxed on white) instead of cropped.
- iOS home-screen install uses the org's logo.

## Non-goals

- Per-org configurable `theme_color` / `background_color` / icon padding color → tracked in #315.
- Backfilling existing org icons. The single property in production will re-upload its logo after deploy.
- Refactoring `theme_color: '#2563eb'` in `manifest.json/route.ts` and `<meta name="theme-color">` in `layout.tsx` → covered by #315.
- Automated tests of binary image output. Verification is manual (install PWA, inspect storage).

## Changes

### 1. `src/app/admin/settings/logo-actions.ts`

Switch all variant backgrounds to white and all `fit` modes to `contain` so the full logo is visible inside each icon.

- `icon-192`: `fit: 'cover'` → `fit: 'contain'` with `background: { r:255, g:255, b:255, alpha:1 }`
- `icon-512`: same treatment
- `icon-512-maskable`:
  - Inner resize: `fit: 'cover'` → `fit: 'contain'` with white background
  - `extend` padding: blue `#2563eb` → white `#ffffff`
- `favicon-32`: `fit: 'cover'` → `fit: 'contain'` with white background
- **New variant** `apple-touch-icon-180.png`: 180×180, `fit: 'contain'`, white background. Apple recommends 180×180 for retina home-screen icons; iOS will not render transparency, so the white background is required for a clean rounded-rect render.

The `original.png` variant (line 40) is unchanged — already uses `fit: 'inside'` with no background fill.

### 2. `src/lib/config/logo-server.ts`

Extend the `LogoVariant` union with `'apple-touch-icon-180.png'` and add a default fallback entry to `DEFAULT_ICONS`. To avoid shipping a new static asset, the default for `apple-touch-icon-180.png` points at the existing `/defaults/logos/icon-192.png` — iOS will downscale 192→180 cleanly, and this fallback only applies to orgs that have not uploaded a logo.

### 3. `src/lib/config/__tests__/logo-server.test.ts`

Add an assertion that `getLogoUrlServer(null, 'apple-touch-icon-180.png')` returns the `/defaults/logos/icon-192.png` fallback, plus a positive case asserting the variant builds a storage URL when `basePath` is set.

### 4. `src/app/layout.tsx`

In the non-platform branch (`<head>` block, lines 67-76):

- Add `<link rel="apple-touch-icon" sizes="180x180" href={getLogoUrlServer(config.logoUrl, 'apple-touch-icon-180.png')} />`
- Switch the existing favicon `href` from the hard-coded `/defaults/logos/favicon-32.png` to `getLogoUrlServer(config.logoUrl, 'favicon-32.png')` so desktop browsers and iOS Safari also pick up the org's logo. (The org's `favicon-32.png` is already generated on every upload.)

`getLogoUrlServer` already falls back to the default logo path when an org has no uploaded logo, so the existing zero-config behavior is preserved for orgs that haven't customized branding.

### 5. No changes to `manifest.json/route.ts`

Manifest icons already reference variant filenames; only the bytes behind those URLs change.

## Migration / rollout

- No DB migration.
- After deploy, the single production property must re-upload its logo via admin to regenerate variants with the fix. This is acceptable per user direction — backfill script not warranted at current scale.
- New variant `apple-touch-icon-180.png` is generated on the next upload; orgs that don't re-upload continue to fall back to the default logo for the apple-touch-icon, which is fine.

## Verification

Manual, since image generation has no existing automated test coverage:

1. `npm run dev`, log in as admin, upload a non-square test logo via admin settings.
2. Inspect Supabase `vault-public/{orgId}/` — confirm presence of `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `favicon-32.png`, `apple-touch-icon-180.png`, `original.png`.
3. Open `/api/manifest.json` — confirm icon URLs resolve.
4. Install PWA on Android Chrome — confirm no blue halo on home-screen icon.
5. Install on iOS Safari ("Add to Home Screen") — confirm apple-touch-icon shows the org logo, not the default.
6. Type-check + tests: `npm run type-check` && `npm run test`.
7. Follow `docs/playbooks/visual-diff-screenshots.md` — capture before/after PWA install screenshots for the PR description.

## Files touched

- `src/app/admin/settings/logo-actions.ts` — background color + fit mode + new `apple-touch-icon-180.png` variant
- `src/lib/config/logo-server.ts` — extend `LogoVariant` union and `DEFAULT_ICONS` map
- `src/lib/config/__tests__/logo-server.test.ts` — add coverage for new variant
- `src/app/layout.tsx` — `<link rel="apple-touch-icon">` + dynamic favicon href

Estimated total: ~25 lines net change.
