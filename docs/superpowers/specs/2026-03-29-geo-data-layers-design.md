# Geo Data Layers — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add the ability to import, display, and manage geographic data layers (Shapefiles, GeoJSON, KML/KMZ) in FieldMapper. Layers are org-owned and assignable to properties. Property boundaries can optionally be defined by a geo layer, enabling spatial filtering of items and layer clipping.

## Goals

- Import common geo formats (Shapefile, GeoJSON, KML, KMZ) with automatic CRS reprojection
- Render layers interactively on property maps with click-to-inspect attributes
- Org-level ownership with per-property assignment and visibility control
- Optional property boundaries that spatially filter items and clip layers
- Full mobile parity for import, viewing, and management
- Integration with AI onboarding to detect and onboard geo files automatically

## Approach

**GeoJSON Storage with PostGIS-Ready Schema (Approach C):** All imported formats convert to GeoJSON at import time. Store as JSONB in PostgreSQL. Use Turf.js for spatial operations (point-in-polygon, intersection). Schema designed so adding a PostGIS `geometry` column later is a non-breaking migration for when large datasets demand it.

---

## 1. Data Model

### `geo_layers` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | PK |
| `org_id` | uuid | FK to orgs, RLS scoping |
| `name` | text | User-assigned layer name |
| `description` | text | Optional description |
| `color` | text | Hex color for rendering |
| `opacity` | float | 0–1, default 0.6 |
| `source_format` | text | Original format (shapefile, geojson, kml, kmz) |
| `source_filename` | text | Original filename for reference |
| `geojson` | jsonb | Full FeatureCollection with attributes preserved |
| `feature_count` | int | Cached count of features |
| `bbox` | jsonb | Bounding box `[minLng, minLat, maxLng, maxLat]` |
| `is_property_boundary` | boolean | If true, eligible as a property boundary |
| `created_at` | timestamptz | |
| `created_by` | uuid | FK to users |

### `geo_layer_properties` join table

| Column | Type | Purpose |
|--------|------|---------|
| `geo_layer_id` | uuid | FK to geo_layers, part of composite PK |
| `property_id` | uuid | FK to properties, part of composite PK |
| `org_id` | uuid | FK to orgs, for RLS scoping |
| `visible_default` | boolean | Whether layer is on by default for this property |

### Changes to `properties` table

| Column | Type | Purpose |
|--------|------|---------|
| `boundary_layer_id` | uuid (nullable) | FK to geo_layers — the layer used as this property's boundary |

When `boundary_layer_id` is set, the property map auto-fits to the boundary bbox, and spatial filtering activates (items filtered by point-in-polygon, other layers clipped by intersection). When null, the property works as it does today (center point + zoom).

### RLS Policies

All `geo_layers` and `geo_layer_properties` rows scoped by `org_id`. Same pattern as existing tables — org members can read, org_admin/org_staff can write.

---

## 2. Import Pipeline

### Supported Formats

| Format | Parser | Notes |
|--------|--------|-------|
| GeoJSON (.geojson, .json) | Native `JSON.parse` | Validate FeatureCollection structure |
| Shapefile (.zip containing .shp/.dbf/.prj) | `shpjs` | Must be zipped; .prj used for CRS detection |
| KML (.kml) | `@tmcw/togeojson` | Lightweight, well-maintained |
| KMZ (.kmz) | `jszip` + `@tmcw/togeojson` | Unzip, extract doc.kml, convert |

### CRS Handling

If a Shapefile includes a .prj file indicating a non-WGS84 projection (e.g., UTM, State Plane), use `proj4` (already installed) to reproject to EPSG:4326. GeoJSON and KML are WGS84 by spec.

### Processing Split

- **Client-side:** Format detection, GeoJSON/KML parsing, small Shapefile parsing (< 5MB)
- **Server action:** Large file processing, proj4 reprojection, validation, storage
- Files uploaded to a temporary Supabase storage bucket, processed by server action, then deleted

### Validation

- Valid geometry types (Point, LineString, Polygon, Multi* variants)
- Coordinates within valid ranges (-180/180 lng, -90/90 lat)
- Feature count warning at > 1000 features (suggest simplification)
- File size limit: 50MB

### 3-Step Import Flow

1. **Upload** — Drag/drop or file picker. Format auto-detected by extension and content inspection.
2. **Preview** — Map preview of parsed features, attribute table sample, name/color/opacity controls.
3. **Confirm** — Save to database, optionally assign to properties, optionally mark as property boundary.

Works on both desktop and mobile. On mobile, steps stack vertically with map preview above the form.

---

## 3. AI Onboarding Integration

The existing AI onboarding flow already detects and parses GeoJSON, KML, KMZ, and GPX files via `parsers.ts`, storing extracted features in `ai_context_geo_features`.

### Extensions

1. **Shapefile detection** — Add Shapefile (.zip with .shp) detection to `parsers.ts` and `isGeoFile()`.
2. **AI classification** — Extend the file analysis prompt to classify geo files: boundary vs. habitat zones vs. trails vs. other. This feeds the pre-fill suggestions.
3. **New `ai-geo-review` step** — Between `ai-review` and completion, a new onboarding step shows detected geo layers with map preview. Users can confirm/rename layers, pick color/opacity, assign to the default property, and mark one as the property boundary.
4. **`onboardCreateOrg()` extension** — After creating the default property and item types, also create `geo_layers` records and `geo_layer_properties` assignments from reviewed geo data. If a boundary was designated, set `boundary_layer_id` on the property.

Non-geo files flow through onboarding unchanged. Manual onboarding path is unaffected. Geo layer import also works standalone post-onboarding via the admin panel.

---

## 4. Map Rendering & Interaction

### New Components

| Component | Purpose |
|-----------|---------|
| `GeoLayerRenderer` | Renders a geo_layer via Leaflet's `L.geoJSON()` with configured color/opacity. Handles click events for feature inspection. |
| `LayerControlPanel` | Toggle layers on/off. Shows layer name + color swatch. Desktop: sidebar alongside MapLegend. Mobile: bottom sheet accessed via layers button. |
| `FeaturePopup` | Click a feature to see attribute key/value pairs. Desktop: Leaflet popup. Mobile: BottomSheet component. |
| `PropertyBoundary` | Renders boundary layer with dashed stroke. Always visible when set (not toggleable). |

### Spatial Filtering (when boundary is set)

- **Items:** Turf.js `booleanPointInPolygon()` filters items to those within the boundary. Applied in server action at query time or client-side for current view.
- **Layer clipping:** Turf.js `intersect()` clips other layers to the property boundary. Computed once when a layer is assigned, cached as derived field. Re-computed if boundary changes.

### Layer Loading Strategy

- Layers load on-demand when toggled on (not all at once)
- GeoJSON fetched from database, cached in React state
- For large layers (> 500 features), use `L.geoJSON` with `onEachFeature` for lazy popup binding

### Mobile

- `LayerControlPanel` collapses into bottom sheet (consistent with existing detail panel pattern)
- Feature popups use BottomSheet on mobile rather than Leaflet native popups
- Touch targets meet 44px minimum

---

## 5. Layer Management (Admin)

### Org-Level: `/{slug}/admin/geo-layers`

- **Layer list** — Table with name, color swatch, geometry type, feature count, assigned properties, source format
- **Upload new** — Triggers 3-step import flow (shared component with onboarding)
- **Edit layer** — Rename, change color/opacity, update description
- **Assign to properties** — Multi-select property picker with `visible_default` toggle per property
- **Set as boundary** — Available on property settings for polygon-type layers
- **Delete layer** — With confirmation. Clears `boundary_layer_id` on any property using it.

### Property-Level: Property Settings Page

New "Geo Layers" section showing:
- Layers assigned to this property with visibility default toggles
- Current boundary layer (if set) with change/remove options
- Link to org-level management for uploading new layers

### Permissions

| Role | Capabilities |
|------|-------------|
| `org_admin`, `org_staff` | Full layer management (upload, edit, assign, delete) |
| `contributor` | View layers on maps, no management |
| `viewer`, `public` | See rendered layers on maps, no management |

No new module flag — geo layers are a core map feature.

---

## 6. Dependencies

### New Packages

| Package | Purpose | Size |
|---------|---------|------|
| `shpjs` | Parse Shapefiles to GeoJSON | ~50KB |
| `@tmcw/togeojson` | Convert KML/KMZ to GeoJSON | ~15KB |
| `@turf/boolean-point-in-polygon` | Item spatial filtering | ~5KB |
| `@turf/intersect` | Layer clipping to boundaries | ~10KB |
| `@turf/bbox` | Compute bounding boxes | ~3KB |
| `jszip` | Extract KMZ archives | ~45KB |

### Already Available

`proj4`, `papaparse`, `xlsx`, `leaflet`, `react-leaflet`

### No New External Services

All processing happens client-side or in Next.js server actions. Storage uses existing Supabase PostgreSQL + storage buckets.

---

## 7. New File Structure

```
src/
  lib/geo/
    parsers.ts            — Format detection, parse to GeoJSON
    spatial.ts            — Turf.js wrappers (point-in-polygon, intersect, bbox)
    types.ts              — GeoLayer, GeoFeature types
  components/geo/
    GeoLayerRenderer.tsx  — Leaflet GeoJSON layer rendering
    LayerControlPanel.tsx — Toggle layers on/off (desktop + mobile bottom sheet)
    FeaturePopup.tsx      — Click-to-inspect feature attributes
    PropertyBoundary.tsx  — Boundary rendering with dashed stroke
    ImportFlow.tsx        — 3-step import wizard (upload → preview → confirm)
    LayerStylePicker.tsx  — Color/opacity selection
  app/admin/geo-layers/
    page.tsx              — Org-level layer management
    actions.ts            — Server actions (CRUD, assign, import)
```

### Existing Files Modified

- `src/components/map/MapView.tsx` — Integrate GeoLayerRenderer + LayerControlPanel
- `src/lib/ai-context/parsers.ts` — Add Shapefile detection
- `src/app/onboard/page.tsx` — Add geo-review step
- `src/app/onboard/actions.ts` — Extend onboardCreateOrg for geo layers
- Property settings page — Add geo layers section

---

## 8. Performance Considerations

- **Small/medium datasets (< 500 features):** Render directly, no optimization needed
- **Large datasets (500–5000 features):** On-demand loading, lazy popup binding
- **Very large datasets (> 5000 features):** Warning at import, suggest simplification. Future upgrade path: PostGIS with server-side tile rendering (MVT)
- **Boundary clipping:** Computed once per layer-property assignment, cached. Not real-time.

## 9. Future Upgrade Path

When dataset sizes demand it:
1. Add PostGIS extension to Supabase
2. Add `geometry` column to `geo_layers` (populated from existing JSONB)
3. Replace Turf.js spatial operations with PostGIS queries (`ST_Contains`, `ST_Intersects`)
4. Add spatial indexes for large dataset performance
5. Style-by-attribute support (color features by attribute values)

This is a non-breaking migration — the JSONB column remains for Leaflet rendering, PostGIS handles spatial queries.
