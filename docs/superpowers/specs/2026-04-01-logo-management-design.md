# Logo Management System Design

**Issue:** PWA install banner not showing due to missing icons; logo management is manual URL paste
**Date:** 2026-04-01

## Summary

Replace the manual logo URL text input with a logo upload system that generates resized variants for PWA icons, favicons, and general branding. Include default starter logos for sites that haven't uploaded a custom one.

## Upload Flow

1. User visits org settings (or property settings) and sees a logo section with:
   - 3-5 default starter logos (nature/conservation themed PNGs) displayed as selectable presets
   - A file upload button for custom logos
2. On selection or upload, a server action receives the image and uses `sharp` to generate five variants:
   - `original.png` — original image preserved
   - `icon-192.png` — 192x192 PNG (PWA standard icon)
   - `icon-512.png` — 512x512 PNG (PWA splash/large icon)
   - `icon-512-maskable.png` — 512x512 PNG with 20% padding for maskable safe zone
   - `favicon-32.png` — 32x32 PNG (browser tab favicon)
3. All variants are uploaded to a `branding` Supabase storage bucket at:
   - Org logos: `branding/{org_id}/`
   - Property logos: `branding/{org_id}/{property_id}/`
4. The storage base path is saved to the existing `logo_url` column on `orgs` or `properties`

## Storage

- New Supabase storage bucket: `branding` (public read)
- RLS policies: public SELECT, authenticated INSERT/UPDATE
- Storage path convention: `{org_id}/{variant}.png` or `{org_id}/{property_id}/{variant}.png`

## Retrieval

- Helper function `getLogoUrl(basePath: string, variant: string): string` builds the full Supabase public URL for a given variant
- `getConfig()` continues returning `logoUrl` as the base storage path
- Consumers call `getLogoUrl(config.logoUrl, 'icon-192.png')` to get specific variants

## Usage Across the Site

| Context | Variant | How |
|---------|---------|-----|
| PWA manifest | `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` | Manifest route uses `getLogoUrl()` |
| Browser favicon | `favicon-32.png` | `<link rel="icon">` in layout.tsx |
| Header bar / navigation | `original.png` | Next.js `<Image>` for responsive sizing |
| Puck HeaderBar component | `original.png` | Via `config.logoUrl` + `getLogoUrl()` |

## Default Logos

- 3-5 nature/conservation themed PNG logos ship as static assets in `public/defaults/logos/`
- Displayed as selectable presets in the LogoUploader component
- When a user picks a default, it is copied into their `branding/` storage path and the same variants are generated
- If no logo is configured at all, the manifest route falls back to a default logo from `public/defaults/logos/` so PWA install always works

## Files to Create/Modify

### New files
- `src/app/admin/settings/logo-actions.ts` — server action for upload, resize (sharp), and storage
- `src/components/admin/LogoUploader.tsx` — UI component with preset picker + file upload + preview
- `src/lib/config/logo.ts` — `getLogoUrl()` helper
- `supabase/migrations/XXX_branding_bucket.sql` — create branding storage bucket + RLS policies
- `public/defaults/logos/*.png` — 3-5 default starter logos

### Modified files
- `package.json` — add `sharp` dependency
- `src/app/admin/settings/page.tsx` — replace logo URL text input with LogoUploader
- `src/app/admin/properties/[slug]/settings/page.tsx` — add LogoUploader to property settings
- `src/app/api/manifest.json/route.ts` — use `getLogoUrl()` for icon URLs with fallback
- `src/app/layout.tsx` — add `<link rel="icon">` using favicon variant
