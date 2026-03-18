# Generic Field Mapper — Design Spec

## Overview

Refactor the IslandWood Birdhouses app into a generic, open-source point-of-interest mapper template. Anyone can fork the repo, run through a setup wizard, and have a fully branded mapping app without touching code. Developers can extend it with custom pages and components.

## Goals

- **Non-technical users** can fork, deploy, and configure entirely through an in-app setup wizard and admin settings UI
- **Multiple item types** per deployment (bird boxes, bat boxes, info stations, etc.) with custom fields per type
- **All identity from config** — no hardcoded app names, locations, or branding
- **Developer extensibility** — clean codebase that supports adding bespoke pages, components, and database extensions
- **No performance regression** — config cached with short revalidation, zero extra latency on normal page loads

## Approach

**Config Table + Settings UI (Approach A):** All configuration stored in a Supabase `site_config` key-value table with JSONB values. First-run setup wizard writes to this table. Admin settings UI reads/writes to same table. Config cached server-side with 60-second revalidation, busted immediately on admin save via `revalidateTag`.

---

## Data Model

### New Tables

#### `site_config`

Key-value store for all site-level settings.

| Column | Type | Notes |
|--------|------|-------|
| key | text (PK) | e.g., `site_name`, `map_center`, `theme` |
| value | jsonb | Flexible value storage |
| updated_at | timestamptz | |

**Example rows:**

| Key | Value |
|-----|-------|
| `site_name` | `"IslandWood Birdhouses"` |
| `tagline` | `"Eagle Scout Project"` |
| `location_name` | `"Bainbridge Island, Washington"` |
| `map_center` | `{"lat": 47.6235, "lng": -122.5185, "zoom": 16}` |
| `theme` | `{"preset": "forest", "overrides": {"primary": "#5D7F3A"}}` |
| `about_content` | `"# About\nThis project..."` (markdown) |
| `logo_url` | `"https://..."` |
| `favicon_url` | `"https://..."` |
| `footer_text` | `"Built with Field Mapper"` |
| `footer_links` | `[{"label": "IslandWood", "url": "https://islandwood.org"}]` |
| `custom_map` | `{"url": "...", "bounds": {...}, "opacity": 0.7}` |
| `custom_nav_items` | `[{"label": "Sponsors", "href": "/sponsors"}]` |
| `setup_complete` | `true` |

#### `item_types`

Defines what kinds of things are tracked.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | e.g., "Bird Box" |
| icon | text | Emoji character used as map marker and in UI labels (e.g., "🏠", "🦇", "ℹ️") |
| color | text | Hex color for map marker |
| sort_order | int | Display ordering |
| created_at | timestamptz | |

#### `custom_fields`

Per-type custom fields.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| item_type_id | uuid (FK → item_types) | |
| name | text | e.g., "Target Species" |
| field_type | text | `text`, `number`, `dropdown`, `date` |
| options | jsonb | For dropdowns: `["Chickadee", "Swallow", ...]` |
| required | boolean | |
| sort_order | int | |

#### `update_types`

Configurable update/log types.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | e.g., "Observation" |
| icon | text | Emoji character (e.g., "🔧", "👀", "📝") |
| is_global | boolean | Available for all item types |
| item_type_id | uuid (FK → item_types, nullable) | If not global, which type. CHECK: `(is_global = true AND item_type_id IS NULL) OR (is_global = false AND item_type_id IS NOT NULL)` |
| sort_order | int | |

### Modified Existing Tables

- **`birdhouses` → `items`**: add `item_type_id` (FK → `item_types`), add `custom_field_values` (jsonb — stores `{field_id: value}` pairs)
- **`birdhouse_updates` → `item_updates`**: replace `update_type` enum with `update_type_id` (FK → `update_types`)
- **`photos`**: rename `birdhouse_id` → `item_id`
- **`bird_species`** → removed (replaced by custom fields with dropdown type)

### Row Level Security

All new tables need RLS policies:

- **`site_config`**: SELECT for anonymous (public site must read config to render). INSERT/UPDATE/DELETE for admin role only.
- **`item_types`**: SELECT for anonymous. INSERT/UPDATE/DELETE for admin role only.
- **`custom_fields`**: SELECT for anonymous. INSERT/UPDATE/DELETE for admin role only.
- **`update_types`**: SELECT for anonymous. INSERT/UPDATE/DELETE for admin role only.
- **`items`** (renamed from `birdhouses`): SELECT for anonymous. INSERT/UPDATE for editor+ role. DELETE for admin only.
- **`item_updates`** (renamed from `birdhouse_updates`): SELECT for anonymous. INSERT/UPDATE for editor+ role. DELETE for admin only.
- **`photos`**: SELECT for anonymous. INSERT for editor+ role. DELETE for admin only.

**Setup wizard exception:** The setup wizard runs before any admin account exists. The initial migration seeds a `setup_complete = false` row in `site_config`. The `/setup` route uses the Supabase service role key (server-side only, never exposed to client) to write config during setup. Once the admin account is created in step 8, subsequent config writes go through normal RLS.

### Standard Fields on `items`

The `items` table retains these columns from `birdhouses`: `id`, `name`, `description`, `latitude`, `longitude`, `status`, `created_at`, `updated_at`, `created_by`. Added: `item_type_id`, `custom_field_values` (jsonb).

The `status` column retains the check constraint (`active`, `planned`, `damaged`, `removed`) as a fixed set across all item types — these are generic enough for any POI tracking use case.

Removed columns:
- `species_target` → migrated to a custom dropdown field on the "Bird Box" item type
- `installed_date` → migrated to a custom date field (not all item types need an installation date)

### Storage Bucket

The existing `birdhouse-photos` storage bucket is renamed to `item-photos`. This requires a server-side script (not a SQL migration) that copies objects via the Supabase storage API, updates `storage_path` values in the `photos` table, and deletes the old bucket. Included as a standalone migration script in the repo.

### Deletion Behavior

- **Deleting an item type:** Blocked if items of that type exist. Admin must reassign or delete items first. UI shows count of affected items and prevents accidental deletion.
- **Deleting a custom field:** The field definition is removed from `custom_fields`. Existing `custom_field_values` JSONB entries retain orphaned keys (harmless) — they are ignored since the field metadata no longer exists to render them.
- **Deleting an update type:** Blocked if updates of that type exist. Admin must reassign existing updates first.

### Migration Path

The migration creates a default "Bird Box" item type, maps existing birdhouse records to it, converts the `species_target` column into a custom dropdown field, and maps existing update type enums to `update_types` rows.

---

## Config Provider & Caching

### Server-Side Config Fetching

`getConfig()` server-side function fetches all `site_config` rows. Uses Next.js `unstable_cache` with 60-second revalidation and a `site-config` cache tag. Returns a typed `SiteConfig` object.

### React Context

`ConfigProvider` wraps the app in `layout.tsx`. Server component fetches config, passes to a client context provider. All components access config via `useConfig()` hook.

### Cache Invalidation

When admin saves settings, call `revalidateTag('site-config')` for immediate effect.

### SiteConfig Type

```typescript
interface SiteConfig {
  siteName: string;
  tagline: string;
  locationName: string;
  mapCenter: { lat: number; lng: number; zoom: number };
  theme: { preset: string; overrides?: Record<string, string> };
  aboutContent: string; // markdown
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string;
  footerLinks: { label: string; url: string }[];
  customMap: {
    url: string;
    bounds: {
      southWest: { lat: number; lng: number };
      northEast: { lat: number; lng: number };
    };
    rotation: number; // degrees, 0 = no rotation
    corners?: { // for rotated overlays (3-corner representation)
      topLeft: { lat: number; lng: number };
      topRight: { lat: number; lng: number };
      bottomLeft: { lat: number; lng: number };
    };
    opacity: number;
  } | null;
  customNavItems: { label: string; href: string }[];
  setupComplete: boolean;
}
```

---

## Setup Wizard

Appears on first visit when `setup_complete` is `false`. Middleware redirects all routes to `/setup` (except `/setup` itself and auth callback).

### Steps

1. **Welcome** — brief explanation of what the tool does
2. **Name & Location** — site name, tagline, location name. Map picker for center coordinates (reuses `LocationPicker`). Zoom slider.
3. **Theme** — visual grid of preset themes. Optional "Customize" toggle reveals color pickers for primary, secondary, accent. Map tile preview updates with selection.
4. **Custom Map Overlay** (optional) — see Custom Map Overlay section below
5. **Logo & Icon** — upload logo and favicon, or skip for defaults
6. **Item Types** — define types with icons/colors, custom fields per type, update types per type (pre-filled with global defaults)
7. **About Page** — markdown editor with live preview, pre-filled template
8. **Admin Account** — Supabase auth signup + profile with admin role
9. **Review & Finish** — summary of all settings, "Launch" button sets `setup_complete = true`

After completion, redirects to home page. All settings editable later under `/admin/settings`.

---

## Custom Map Overlay

Allows overlaying a custom image (park map, trail map, facility diagram) on top of base map tiles, aligned to real-world coordinates. Uses Leaflet's `L.imageOverlay` with computed bounds.

### Upload

- Drag/drop image (PNG, JPG) or PDF (converted to image server-side), or paste a URL
- Preview the uploaded image

### Anchor-Based Alignment

1. **Place first anchor** — user clicks a recognizable point on their uploaded image (e.g., building corner, trail intersection), then either:
   - **Clicks the same point on the OpenStreetMap**, or
   - **Uses phone GPS** — physically stands at the spot and taps "Use My Location"
2. **Place second anchor** — repeat for a second point, far from the first. Two points define position, scale, and rotation.
3. **Translucent overlay preview** — overlay renders at ~50% opacity with OpenStreetMap visible underneath. User can directly see if roads, buildings, and water features line up. Opacity slider from fully transparent to fully opaque.
4. **Fine-tune** — nudge, rotate, scale controls while seeing both layers simultaneously
5. **Optional third anchor** — for non-rectangular or complex maps, improves accuracy
6. **Confirm or Skip** — save overlay bounds, or skip entirely

### Safety Rails

- Undo at each step
- Opacity slider for visual verification
- Can redo alignment later in admin settings
- Skip option — entirely optional
- Validation: warn if overlay is extremely large or tiny (likely wrong scale)

### Technical Implementation

**Coordinate computation:** Two anchor points (image pixel coordinates + real-world lat/lng pairs) define a similarity transformation (translation, uniform scale, rotation). Compute scale factor from the ratio of real-world distance to pixel distance between anchors, and rotation from the angle difference. Apply this transform to the image's corner pixels to get lat/lng bounds. A third anchor enables affine transformation (non-uniform scale + skew) for better accuracy.

**Rotation handling:** Leaflet's `L.imageOverlay` only supports axis-aligned rectangular bounds. If rotation is minimal (< 2 degrees), use `L.imageOverlay` directly with axis-aligned bounding box. For significant rotation, use the `leaflet-imageoverlay-rotated` plugin which accepts three corner coordinates and renders rotated/skewed overlays via CSS transforms.

**PDF conversion:** Use the `pdfjs-dist` library (Mozilla's PDF.js) client-side to render the first page of a PDF to a canvas, then export as PNG. No server-side conversion needed. Limit: single-page PDFs only; if multi-page, prompt user to select which page. Max file size: 10MB.

**Stored result:** The computed bounds (`southWest` and `northEast` lat/lng, plus optional rotation angle) are saved to `site_config` under the `custom_map` key.

---

## Admin Settings

All settings editable under `/admin/settings`, organized as tabs matching wizard steps. Reuses same form components as setup wizard.

### Tabs

- **General** — site name, tagline, location name, map center
- **Appearance** — theme preset, color overrides, logo/favicon
- **Custom Map** — overlay management (same alignment flow, plus delete)
- **Item Types** — CRUD for types, custom fields, per-type update types
- **Update Types** — manage global update types
- **About Page** — markdown editor with live preview
- **Footer** — footer text and links

Each tab saves independently. Changes take effect within seconds via cache revalidation.

---

## Theming System

### Preset Themes

Each theme defines CSS custom properties and a matching map tile layer.

| Theme | Primary | Secondary | Accent | Background | Map Tiles |
|-------|---------|-----------|--------|------------|-----------|
| Forest | `#5D7F3A` | `#2C3E2D` | `#D4A853` | `#FAFAF7` | CartoDB Voyager |
| Ocean | `#2B6CB0` | `#1A365D` | `#ECC94B` | `#F7FAFC` | CartoDB Positron |
| Desert | `#C05621` | `#7B341E` | `#D69E2E` | `#FFFAF0` | Stadia Outdoors |
| Urban | `#4A5568` | `#1A202C` | `#ED8936` | `#F7FAFC` | CartoDB Dark Matter |
| Arctic | `#3182CE` | `#2A4365` | `#90CDF4` | `#EBF8FF` | Stadia Smooth |
| Meadow | `#68D391` | `#276749` | `#F6E05E` | `#F0FFF4` | OpenStreetMap default |

### Implementation

- Theme preset + overrides stored in `site_config`
- `ConfigProvider` resolves final colors and injects CSS custom properties on `<html>`
- Tailwind references CSS variables: `primary: 'var(--color-primary)'`
- Map component reads tile URL from resolved theme
- Font pairings fixed: Playfair Display (headings) + DM Sans (body), loaded via Google Fonts in `layout.tsx`

### Override Flow (Admin)

- Pick a preset (visual swatches)
- Toggle "Customize colors" for individual color pickers
- Live preview updates as values change
- "Reset to preset" button to undo overrides

---

## Generic Item System

### Component Renaming

| Current | Generic |
|---------|---------|
| `BirdhouseCard` | `ItemCard` |
| `BirdhouseMarker` | `ItemMarker` |
| `BirdhouseForm` | `ItemForm` |
| `BirdMap` | `MapView` |
| `BirdCard` | removed (species become custom field dropdowns) |
| `DetailPanel` | `DetailPanel` (unchanged) |
| `MapLegend` | `MapLegend` (unchanged, auto-generates from item types) |
| `UpdateTimeline` | `UpdateTimeline` (unchanged) |
| `UpdateForm` | `UpdateForm` (unchanged, reads update types from config) |
| `StatusBadge` | `StatusBadge` (unchanged) |
| `LocationPicker` | `LocationPicker` (unchanged, reused in setup wizard) |
| `PhotoUploader` | `PhotoUploader` (unchanged) |
| `Navigation` | `Navigation` (unchanged, reads config for app name/logo/custom nav) |
| `Footer` | `Footer` (unchanged, reads config for text/links) |

### How Item Types Drive the UI

- **Map view** — each type has its own marker icon and color. Legend auto-generates from defined types. Filter toggles per type.
- **List view** — filter/group by type. Cards show type-relevant custom fields.
- **Item form** — user picks type first, form dynamically renders that type's custom fields below standard fields (name, description, location, status).
- **Detail panel** — standard fields plus custom field values, rendered by field type (text as text, dropdown as badge, date formatted, number displayed).
- **Update form** — global update types plus type-specific update types.

### Custom Field Value Storage

JSONB on `items` row: `{"field_uuid_1": "Chickadee", "field_uuid_2": 12, "field_uuid_3": "2025-06-15"}`. Queried by field ID, displayed using field metadata from `custom_fields` table.

---

## Routes & Navigation

### Route Structure

| Route | Purpose | Change |
|-------|---------|--------|
| `/` | Map view | Reads config for center/zoom/tiles, renders all item types |
| `/list` | Item list | Generic, filterable by type |
| `/about` | About page | Renders markdown from config |
| `/login` | Auth | Generic branding from config |
| `/setup` | First-run wizard | **New** |
| `/manage` | Editor dashboard | Generic item management |
| `/manage/add` | Add item | Type selector → dynamic form |
| `/manage/update` | Add update/log | Type-aware update types |
| `/admin` | Admin dashboard | Users, items, updates management |
| `/admin/settings` | Site settings | **New** — tabbed settings UI |

### Removed Routes

- `/birds` — bird species become a custom dropdown field on a "Bird Box" item type

### Navigation

- Nav items (Map, List, About) are fixed core functionality
- App name and logo from config
- Mobile bottom tabs unchanged in structure
- Custom nav items from `custom_nav_items` config

### Middleware

- **Setup redirect:** Middleware runs on Edge runtime and cannot use `unstable_cache`. On first request, middleware makes a lightweight Supabase REST query for the `setup_complete` key from `site_config`. Once setup is complete, a `setup_done=true` cookie is set so subsequent requests skip the DB check entirely. If the cookie is absent and `setup_complete` is false (or the key doesn't exist), redirect to `/setup`.
- Existing auth/role protection unchanged

---

## Developer Extensibility

### Adding Custom Pages

Standard Next.js App Router — create files in `src/app/`. Layout, config provider, and navigation work automatically. Custom pages access config via `useConfig()` and item data via existing Supabase queries.

### Overriding Components

Components stay modular. Replace `ItemCard`, `DetailPanel`, or any component independently. Theme CSS variables available to custom components.

### Custom Nav Items

`custom_nav_items` config key (JSON array) lets admins add links without code: `[{"label": "Sponsors", "href": "/sponsors"}]`. Developers create the page, config handles the nav entry.

### Database Extensions

Developers can add new Supabase tables and migrations alongside the existing schema. JSONB custom fields handle most cases without schema changes.

### Documentation

`TEMPLATE.md` in repo root: how to fork, how config works, how to add pages, how to customize components, how to run setup wizard.

---

## Implementation Phasing

This spec covers a large refactor. Recommended implementation order:

1. **Phase 1: Data model + config provider** — new tables, migration, `getConfig()`, `ConfigProvider`, `useConfig()` hook. This is the foundation everything else depends on.
2. **Phase 2: Generic item system** — rename tables/components, item types, custom fields, update types. Core app functionality becomes generic.
3. **Phase 3: Theming system** — CSS variables, preset themes, Tailwind integration. Visual identity becomes configurable.
4. **Phase 4: Admin settings UI** — tabbed settings pages for all configurable values.
5. **Phase 5: Setup wizard** — first-run experience, middleware redirect.
6. **Phase 6: Custom map overlay** — upload, anchor alignment, overlay rendering. Most complex standalone feature.
